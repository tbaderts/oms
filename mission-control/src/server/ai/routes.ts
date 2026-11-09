import { randomBytes } from 'node:crypto';
import type { LanguageModel } from 'ai';
import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { FIGURES, FIGURE_LABELS } from '../../shared/types.js';
import { problem } from '../api/routes.js';
import type { AiConfig } from '../config.js';
import { silentLogger, type Logger } from '../log.js';
import { OmsClient } from '../oms/OmsClient.js';
import type { RunEngine } from '../run/RunEngine.js';
import type { RunStore } from '../run/RunStore.js';
import { InvestigationService } from './InvestigationService.js';
import { buildTools, runWindow, type RunContext } from './tools.js';

export interface InvestigationDeps {
  config: { ai: AiConfig; mimirUrl: string; lokiUrl: string; allowedHosts: string[] };
  store: RunStore;
  engine: RunEngine;
  log?: Logger;
  env?: NodeJS.ProcessEnv;
  /** Test seam (see InvestigationService). */
  model?: LanguageModel;
}

const investigateBody = z.object({ prompt: z.string().trim().min(1).max(8000), maxSteps: z.number().int().optional() });

export function systemPrompt(run: RunContext): string {
  const w = runWindow(run);
  const figures = FIGURES.map((f) => `- ${f}: ${FIGURE_LABELS[f]}`).join('\n');
  return [
    'You investigate a load run that Mission Control drove against OMS, an event-sourced order management system.',
    `Run ${run.summary.runId}: ${run.config.rate} orders/s for ${run.config.durationSec} s, MARKET/LIMIT orders created over REST, acknowledged and filled by the exchange simulator through Kafka.`,
    'Latency figures are measured on Mission Control\'s clock from each order\'s scheduled send time, in ms:',
    figures,
    'Checkpoint deltas come from the OMS SLA fields on OrderMessage: omsAck = ackTime − orderReceivedTime, omsToMarket = marketSendTime − orderReceivedTime, marketRoundTrip = marketAckTime − marketSendTime.',
    'Path of an order: REST create → order_events + transactional outbox → OutboxRelay → oms_orders → simulator → commands topic → oms-core consumer → oms_orders / oms_order_executions.',
    `Metric and log queries are limited to ${new Date(w.start).toISOString()} … ${new Date(w.end).toISOString()}.`,
    'If the run is flagged generatorLimited, say so first: its numbers reflect Mission Control, not OMS.',
    'Use the tools to gather evidence before concluding. Cite the numbers you rely on. Be concise.',
  ].join('\n');
}

/** GET /mc/ai/status, POST /mc/runs/:id/investigate (SSE of ai:* events), POST /mc/investigations/:invId/stop. */
export function mountInvestigations(app: Hono, d: InvestigationDeps): InvestigationService {
  const log = d.log ?? silentLogger;
  const service = new InvestigationService(d.config.ai, d.env ?? process.env, { model: d.model });

  app.get('/mc/ai/status', (c) => c.json(service.status()));

  app.post('/mc/runs/:id/investigate', async (c) => {
    const id = c.req.param('id');
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return problem(c, 400, 'Malformed JSON body');
    }
    const body = investigateBody.safeParse(raw);
    if (!body.success) return problem(c, 422, 'Invalid investigation request', body.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));

    let run: RunContext | null = null;
    if (d.engine.activeRunId() === id) {
      const snap = d.engine.snapshot()!;
      run = { config: d.engine.activeConfig()!, summary: snap.summary, series: snap.series, samples: d.engine.activeSamples()! };
    } else {
      run = await d.store.get(id);
    }
    if (!run) return problem(c, 404, 'Run not found', id);
    // The orderEvents tool calls the run's oms-core: recheck the allowlist, which may have narrowed since the run.
    const host = new URL(run.config.omsBaseUrl).hostname;
    if (!d.config.allowedHosts.includes(host)) {
      return problem(c, 422, 'Run target is not allowlisted', `host ${host} is not in MC_ALLOWED_HOSTS`, { check: 'allowlist' });
    }

    const invId = randomBytes(6).toString('hex');
    const oms = new OmsClient(run.config.omsBaseUrl);
    const tools = buildTools({ run, oms, mimirUrl: d.config.mimirUrl, lokiUrl: d.config.lokiUrl });
    log.info('investigation started', { runId: id, invId });
    return streamSSE(c, async (stream) => {
      stream.onAbort(() => void service.stop(invId));
      await stream.writeSSE({ event: 'start', data: JSON.stringify({ invId }) });
      const pending: Promise<void>[] = [];
      await service.run({
        invId,
        prompt: body.data.prompt,
        system: systemPrompt(run),
        tools,
        maxSteps: body.data.maxSteps,
        emit: (e) => void pending.push(stream.writeSSE({ event: 'ai', data: JSON.stringify(e) })),
      });
      await Promise.all(pending);
      await oms.close();
    });
  });

  app.post('/mc/investigations/:invId/stop', (c) =>
    service.stop(c.req.param('invId')) ? c.json({ stopping: true }) : problem(c, 409, 'Investigation is not running', c.req.param('invId')),
  );

  return service;
}
