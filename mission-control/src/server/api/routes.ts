import { Hono, type Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { FIGURES, runConfig, type Figure, type OrderSample } from '../../shared/types.js';
import { ActiveRunError, RunRefusedError, type RunEngine } from '../run/RunEngine.js';
import type { RunStore } from '../run/RunStore.js';

export interface ApiDeps {
  engine: RunEngine;
  store: RunStore;
  snapshotIntervalMs?: number;
  /** Browser origins allowed to POST (the UI's own). Default: the server and the Vite dev server on localhost/127.0.0.1. */
  allowedOrigins?: string[];
  /** Extra routes (the AI investigation, T-15) mounted on the same app. */
  extend?: (app: Hono) => void;
}

export function defaultOrigins(port = 8097, devPort = 5181): string[] {
  return ['localhost', '127.0.0.1'].flatMap((h) => [`http://${h}:${port}`, `http://${h}:${devPort}`]);
}

/** RFC 7807 Problem+JSON (P-13). */
export function problem(c: Context, status: 400 | 403 | 404 | 409 | 415 | 422 | 500 | 503, title: string, detail?: string, extra: Record<string, unknown> = {}) {
  return c.body(JSON.stringify({ type: 'about:blank', title, status, detail, ...extra }), status, { 'content-type': 'application/problem+json' });
}

const samplesQuery = z.object({
  sort: z.enum(FIGURES).optional(),
  limit: z.coerce.number().int().min(1).max(10_000).default(1000),
});

export function createApp(d: ApiDeps): Hono {
  const app = new Hono();
  const interval = d.snapshotIntervalMs ?? 1000;
  const origins = new Set(d.allowedOrigins ?? defaultOrigins());

  // Binding to 127.0.0.1 does not stop a web page in the user's browser from POSTing here: a
  // cross-origin text/plain POST is a CORS "simple request" that is sent without a preflight.
  // Every POST must therefore come from the UI's own origin (or carry none, as CLI clients do)
  // and be application/json, which a foreign page cannot send without a preflight we never grant.
  app.use('/mc/*', async (c, next) => {
    if (c.req.method !== 'POST') return next();
    const origin = c.req.header('origin');
    if (origin && !origins.has(origin)) return problem(c, 403, 'Origin not allowed', origin);
    if (!(c.req.header('content-type') ?? '').toLowerCase().startsWith('application/json')) {
      return problem(c, 415, 'POST requires Content-Type: application/json');
    }
    return next();
  });

  app.get('/mc/health', (c) => c.json({ status: 'UP', activeRun: d.engine.activeRunId() }));

  app.post('/mc/runs', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return problem(c, 400, 'Malformed JSON body');
    }
    const parsed = runConfig.safeParse(body);
    if (!parsed.success) {
      return problem(c, 422, 'Invalid run configuration', parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '));
    }
    try {
      const { runId } = await d.engine.start(parsed.data);
      return c.json({ runId }, 201);
    } catch (e) {
      if (e instanceof RunRefusedError) return problem(c, 422, 'Run refused by preflight', e.refusal.detail, { check: e.refusal.check });
      if (e instanceof ActiveRunError) return problem(c, 409, 'A run is already active', `run ${e.runId}`, { activeRunId: e.runId });
      throw e;
    }
  });

  app.post('/mc/runs/:id/stop', (c) =>
    d.engine.stop(c.req.param('id')) ? c.json({ stopping: true }) : problem(c, 409, 'Run is not active', c.req.param('id')),
  );

  app.get('/mc/runs', async (c) => {
    const stored = await d.store.list();
    const live = d.engine.snapshot();
    return c.json(live ? [{ runId: live.summary.runId, readable: true, summary: live.summary }, ...stored] : stored);
  });

  app.get('/mc/runs/:id', async (c) => {
    const id = c.req.param('id');
    if (d.engine.activeRunId() === id) return c.json({ config: d.engine.activeConfig(), ...d.engine.snapshot()! });
    const run = await d.store.get(id);
    if (!run) return problem(c, 404, 'Run not found', id);
    const { samples: _samples, ...rest } = run;
    return c.json(rest);
  });

  app.get('/mc/runs/:id/samples', async (c) => {
    const id = c.req.param('id');
    const q = samplesQuery.safeParse(c.req.query());
    if (!q.success) return problem(c, 422, 'Invalid query', q.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    const samples = d.engine.activeRunId() === id ? d.engine.activeSamples()! : (await d.store.get(id))?.samples;
    if (!samples) return problem(c, 404, 'Run not found', id);
    return c.json(sortSamples(samples, q.data.sort).slice(0, q.data.limit));
  });

  app.get('/mc/runs/:id/stream', (c) => {
    const id = c.req.param('id');
    return streamSSE(c, async (stream) => {
      let aborted = false;
      stream.onAbort(() => {
        aborted = true;
      });
      while (!aborted && d.engine.activeRunId() === id) {
        const snap = d.engine.snapshot();
        if (snap) await stream.writeSSE({ event: 'snapshot', data: JSON.stringify(snap) });
        await stream.sleep(interval);
      }
      if (!aborted) {
        const run = await d.store.get(id);
        await stream.writeSSE({ event: 'done', data: JSON.stringify(run ? { summary: run.summary, series: run.series } : null) });
      }
    });
  });

  d.extend?.(app);

  app.onError((err, c) => problem(c, 500, 'Internal error', err.message));
  return app;
}

/** Slowest first by the given figure; orders that never reached it go last. Unsorted keeps seq order. */
export function sortSamples(samples: OrderSample[], figure?: Figure): OrderSample[] {
  if (!figure) return samples;
  return [...samples].sort((a, b) => (b.figures[figure] ?? -Infinity) - (a.figures[figure] ?? -Infinity));
}
