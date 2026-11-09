import { InvestigationService, clampSteps } from '../../src/server/ai/InvestigationService';
import { buildTools, runWindow } from '../../src/server/ai/tools';
import { forConfig, notConfiguredReason } from '../../src/server/ai/adapters';
import { OmsClient } from '../../src/server/oms/OmsClient';
import { statsOf } from '../../src/server/run/RunStats';
import { runConfig, type AiEvent, type OrderSample, type RunSummary } from '../../src/shared/types';
import type { StoredRun } from '../../src/server/run/RunStore';
import { fakeModel, textStep, toolStep } from '../support/fakeModel';
import { json, stubHttp, type StubServer } from '../support/stubHttp';

const ANTHROPIC = { provider: 'anthropic' as const, model: 'claude-sonnet-5-5', maxTokens: 1000 };

function run(): StoredRun {
  const s = statsOf([10, 20, 900]);
  const sample = (seq: number, toFilled: number): OrderSample => ({
    seq, clOrdId: `r-${seq}`, orderId: `O${seq}`, scheduledAt: 1, timeline: [], figures: { toFilled }, deltas: {},
  });
  const summary = {
    runId: 'r', status: 'COMPLETED', startedAt: 1_762_600_000_000, endedAt: 1_762_600_060_000, targetRate: 20, achievedRate: 20,
    p99LatenessMs: 1, generatorLimited: false, scheduled: 3, sent: 3, created: 3, createErrors: [], rejected: [], incomplete: [],
    stateCounts: { FILLED: 3 }, decodeErrors: 0,
    figures: { toOmsAck: s, toMarket: s, toLive: s, toFirstFill: s, toFilled: s },
    deltas: { omsAck: s, omsToMarket: s, marketRoundTrip: s },
  } as RunSummary;
  return { formatVersion: 1, config: runConfig.parse({ rate: 20, durationSec: 60 }), summary, series: [], samples: [sample(0, 10), sample(1, 900), sample(2, 20)] };
}

describe('InvestigationService (AC-8)', () => {
  let infra: StubServer;
  afterEach(async () => infra?.close());

  it('agent calls every tool and streams the answer', async () => {
    infra = await stubHttp((req, res) => {
      if (req.url.startsWith('/api/query/orders/O1/events')) return json(res, 200, [{ version: 1, event: 'NEW_ORDER' }]);
      if (req.url.startsWith('/prometheus/api/v1/query_range')) return json(res, 200, { status: 'success', data: { result: [{ metric: {}, values: [[1, '0.5']] }] } });
      if (req.url.startsWith('/loki/api/v1/query_range')) return json(res, 200, { status: 'success', data: { result: [{ stream: {}, values: [['1', 'WARN slow outbox']] }] } });
      json(res, 404, {});
    });
    const r = run();
    const tools = buildTools({
      run: r,
      oms: new OmsClient(infra.url),
      mimirUrl: `${infra.url}/prometheus`,
      lokiUrl: infra.url,
    });
    const calls: unknown[] = [];
    const model = fakeModel(
      [
        toolStep('runSummary', {}, 'c1'),
        toolStep('slowestOrders', { figure: 'toFilled', limit: 2 }, 'c2'),
        toolStep('orderEvents', { orderId: 'O1' }, 'c3'),
        toolStep('queryMetrics', { promql: 'sum(rate(oms_order_events[1m]))', stepSeconds: 15 }, 'c4'),
        toolStep('queryLogs', { logql: '{service_name="oms-core"} |= "WARN"', limit: 50 }, 'c5'),
        textStep('The outbox relay is the bottleneck.'),
      ],
      calls,
    );
    const events: AiEvent[] = [];
    const svc = new InvestigationService(ANTHROPIC, { ANTHROPIC_API_KEY: 'k' }, { model });
    await svc.run({ invId: 'i1', prompt: 'Why is toFilled slow?', system: 'sys', tools, maxSteps: 10, emit: (e) => events.push(e) });

    const toolCalls = events.filter((e) => e.type === 'ai:tool-call').map((e) => (e as { name: string }).name);
    expect(toolCalls).toEqual(['runSummary', 'slowestOrders', 'orderEvents', 'queryMetrics', 'queryLogs']);
    const results = events.filter((e) => e.type === 'ai:tool-result') as Extract<AiEvent, { type: 'ai:tool-result' }>[];
    expect(results).toHaveLength(5);
    expect(results[0].output).toContain('"targetRate":20');
    expect(results[1].output).toMatch(/"seq":1.*"seq":2/s);
    expect(results[1].output).not.toContain('"seq":0');
    expect(results[2].output).toContain('NEW_ORDER');
    expect(results[3].output).toContain('0.5');
    expect(results[4].output).toContain('slow outbox');
    expect(results.every((e) => e.output.length <= 4000)).toBe(true);
    expect(events.filter((e) => e.type === 'ai:message').map((e) => (e as { text: string }).text).join('')).toBe('The outbox relay is the bottleneck.');
    expect(events.filter((e) => e.type === 'ai:done' || e.type === 'ai:error')).toEqual([{ type: 'ai:done', invId: 'i1', aborted: false, incomplete: false }]);
    expect(events.at(-1)!.type).toBe('ai:done');

    // Mimir and Loki were queried over the run's window (start − 1 min … end + 1 min).
    const w = runWindow(r);
    const mimir = new URL(infra.url + infra.requests.find((q) => q.url.startsWith('/prometheus'))!.url);
    expect(Number(mimir.searchParams.get('start'))).toBe(w.start / 1000);
    expect(Number(mimir.searchParams.get('end'))).toBe(w.end / 1000);
    expect(mimir.searchParams.get('step')).toBe('15');
    const loki = new URL(infra.url + infra.requests.find((q) => q.url.startsWith('/loki'))!.url);
    expect(loki.searchParams.get('start')).toBe(String(BigInt(w.start) * 1_000_000n));
    expect(loki.searchParams.get('limit')).toBe('50');
  });

  it('caps the steps and stops at the bound', async () => {
    expect(clampSteps(50)).toBe(20);
    expect(clampSteps(0)).toBe(1);
    expect(clampSteps(undefined)).toBe(8);
    const tools = buildTools({ run: run(), oms: new OmsClient('http://127.0.0.1:1'), mimirUrl: 'http://127.0.0.1:1', lokiUrl: 'http://127.0.0.1:1' });
    const calls: unknown[] = [];
    const counting = fakeModel([toolStep('runSummary', {}, 'c')], calls); // asks for a tool on every step
    const events: AiEvent[] = [];
    await new InvestigationService(ANTHROPIC, { ANTHROPIC_API_KEY: 'k' }, { model: counting }).run({ invId: 'i2', prompt: 'loop', system: 's', tools, maxSteps: 3, emit: (e) => events.push(e) });
    expect(calls).toHaveLength(3);
    expect(events.at(-1)).toEqual({ type: 'ai:done', invId: 'i2', aborted: false, incomplete: true });
  });

  it('not configured yields a configuration error', async () => {
    expect(forConfig(ANTHROPIC, {})).toBeNull();
    expect(forConfig({ ...ANTHROPIC, provider: 'none' }, { ANTHROPIC_API_KEY: 'k' })).toBeNull();
    expect(forConfig({ ...ANTHROPIC, provider: 'local' }, {})).toBeNull();
    expect(forConfig(ANTHROPIC, { ANTHROPIC_API_KEY: 'k' })).not.toBeNull();
    expect(notConfiguredReason(ANTHROPIC, {})).toMatch(/ANTHROPIC_API_KEY/);

    const svc = new InvestigationService(ANTHROPIC, {}, { model: fakeModel([textStep('never')]) });
    expect(svc.status()).toMatchObject({ available: false, provider: 'anthropic' });
    const events: AiEvent[] = [];
    await svc.run({ invId: 'i3', prompt: 'q', system: 's', tools: {}, emit: (e) => events.push(e) });
    expect(events).toEqual([{ type: 'ai:error', invId: 'i3', kind: 'configuration', message: expect.stringMatching(/ANTHROPIC_API_KEY/) }]);
  });
});
