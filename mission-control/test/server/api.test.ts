import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../src/server/api/routes';
import { RunEngine } from '../../src/server/run/RunEngine';
import { RunStore } from '../../src/server/run/RunStore';
import { OmsClient } from '../../src/server/oms/OmsClient';
import { preflight, checkRegistry } from '../../src/server/run/Preflight';
import { systemClock } from '../../src/server/clock';
import { mountInvestigations } from '../../src/server/ai/routes';
import { statsOf } from '../../src/server/run/RunStats';
import { runConfig } from '../../src/shared/types';
import { InMemoryEventSource, orderEvent } from '../support/InMemoryEventSource';
import { fakeModel, textStep, toolStep } from '../support/fakeModel';
import { json, stubHttp, type StubServer } from '../support/stubHttp';

describe('API (AC-4, AC-6)', () => {
  let dir: string;
  const servers: StubServer[] = [];
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'mc-api-'))));
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((s) => s.close()));
    rmSync(dir, { recursive: true, force: true });
  });

  async function stub(handler: Parameters<typeof stubHttp>[0]) {
    const s = await stubHttp(handler);
    servers.push(s);
    return s;
  }

  /** oms-core that is healthy, creates orders and has them filled at once through the in-memory source. */
  async function healthyOms(source: InMemoryEventSource) {
    let n = 0;
    return stub((req, res) => {
      if (req.url === '/actuator/health') return json(res, 200, { status: 'UP' });
      const { order } = JSON.parse(req.body);
      const id = `O${++n}`;
      setTimeout(() => {
        source.push(orderEvent(order.sessionId, order.clOrdId, id, 1, 'UNACK'));
        source.push(orderEvent(order.sessionId, order.clOrdId, id, 2, 'FILLED'));
      }, 5);
      json(res, 201, { id });
    });
  }

  function app(opts: { source: InMemoryEventSource; kafka?: () => Promise<string | null>; registryUrl: string; allowedHosts?: string[] }) {
    const store = new RunStore(dir);
    const engine = new RunEngine({
      clock: systemClock,
      store,
      eventSource: () => opts.source,
      client: (url, timeoutMs) => new OmsClient(url, { timeoutMs }),
      preflight: (config) =>
        preflight(config, {
          allowedHosts: opts.allowedHosts ?? ['127.0.0.1', 'localhost'],
          omsHealth: (url) => new OmsClient(url).health(1000),
          kafka: opts.kafka ?? (async () => null),
          registry: () => checkRegistry(opts.registryUrl, 1000),
        }),
    });
    return { app: createApp({ engine, store, snapshotIntervalMs: 1000 }), engine };
  }

  const post = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  it('refuses a run when a preflight check fails', async () => {
    const registryUp = await stub((_r, res) => json(res, 200, []));
    const registryDown = await stub((_r, res) => json(res, 503, {}));
    const cases: { name: string; check: string; build: () => Promise<{ omsUrl: string; kafka?: () => Promise<string | null>; registryUrl: string; allowedHosts?: string[] }> }[] = [
      { name: 'host not allowlisted', check: 'allowlist', build: async () => ({ omsUrl: (await healthyOms(new InMemoryEventSource())).url, registryUrl: registryUp.url, allowedHosts: ['localhost'] }) },
      { name: 'oms-core unhealthy', check: 'oms-core', build: async () => ({ omsUrl: (await stub((_r, res) => json(res, 503, { status: 'DOWN' }))).url, registryUrl: registryUp.url }) },
      { name: 'kafka unreachable', check: 'kafka', build: async () => ({ omsUrl: (await healthyOms(new InMemoryEventSource())).url, registryUrl: registryUp.url, kafka: async () => 'Connection error: ECONNREFUSED' }) },
      { name: 'registry unreachable', check: 'schema-registry', build: async () => ({ omsUrl: (await healthyOms(new InMemoryEventSource())).url, registryUrl: registryDown.url }) },
    ];
    for (const c of cases) {
      const built = await c.build();
      const source = new InMemoryEventSource();
      const { app: a } = app({ source, ...built });
      const res = await a.request('/mc/runs', post({ omsBaseUrl: built.omsUrl, rate: 10, durationSec: 1 }));
      expect(res.status, c.name).toBe(422);
      expect(res.headers.get('content-type')).toContain('application/problem+json');
      const body = await res.json();
      expect(body, c.name).toMatchObject({ status: 422, check: c.check });
      expect(source.started, c.name).toEqual([]);
    }
    const creates = servers.flatMap((s) => s.requests).filter((r) => r.url === '/api/command/execute');
    expect(creates).toHaveLength(0);
  });

  it('refuses cross-origin and non-JSON POSTs so a web page cannot start a run (P-16)', async () => {
    const source = new InMemoryEventSource();
    const oms = await healthyOms(source);
    const registry = await stub((_r, res) => json(res, 200, []));
    const { app: a } = app({ source, registryUrl: registry.url });
    const body = JSON.stringify({ omsBaseUrl: oms.url, rate: 1, durationSec: 1 });

    // A no-cors "simple request" from another site: text/plain body, foreign Origin.
    const simple = await a.request('/mc/runs', { method: 'POST', headers: { 'content-type': 'text/plain', origin: 'https://evil.example' }, body });
    expect(simple.status).toBe(403);
    const plain = await a.request('/mc/runs', { method: 'POST', headers: { 'content-type': 'text/plain' }, body });
    expect(plain.status).toBe(415);
    const foreign = await a.request('/mc/runs', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' }, body });
    expect(foreign.status).toBe(403);
    expect((await a.request('/mc/runs/x/stop', { method: 'POST', headers: { origin: 'https://evil.example' } })).status).toBe(403);
    expect(foreign.headers.get('content-type')).toContain('application/problem+json');
    expect(source.started).toEqual([]);
    expect(oms.requests.filter((r) => r.url === '/api/command/execute')).toHaveLength(0);

    // The UI's own origins (dev server and the server itself) are accepted.
    for (const origin of ['http://localhost:5181', 'http://127.0.0.1:8097']) {
      const ok = await a.request('/mc/runs/x/stop', { method: 'POST', headers: { 'content-type': 'application/json', origin } });
      expect(ok.status, origin).toBe(409); // passes the guard; the run just is not active
    }
  });

  it('validates the run config and answers Problem+JSON', async () => {
    const registry = await stub((_r, res) => json(res, 200, []));
    const { app: a } = app({ source: new InMemoryEventSource(), registryUrl: registry.url });
    const res = await a.request('/mc/runs', post({ rate: 0, durationSec: 5000 }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.title).toBe('Invalid run configuration');
    expect(body.detail).toMatch(/rate/);
    expect(body.detail).toMatch(/durationSec/);
    expect((await a.request('/mc/runs/nope')).status).toBe(404);
    expect((await a.request('/mc/runs/nope/stop', { method: 'POST', headers: { 'content-type': 'application/json' } })).status).toBe(409);
  });

  it('reports AI status and streams an investigation of a stored run (AC-8)', async () => {
    const store = new RunStore(dir);
    const engine = new RunEngine({ clock: systemClock, store, eventSource: () => new InMemoryEventSource(), client: (u) => new OmsClient(u), preflight: async () => null });
    const aiConfig = { ai: { provider: 'anthropic' as const, model: 'm', maxTokens: 100 }, mimirUrl: 'http://127.0.0.1:1', lokiUrl: 'http://127.0.0.1:1', allowedHosts: ['localhost', '127.0.0.1'] };

    const off = createApp({ engine, store, extend: (a) => mountInvestigations(a, { config: aiConfig, store, engine, env: {} }) });
    expect(await (await off.request('/mc/ai/status')).json()).toMatchObject({ available: false, reason: expect.stringMatching(/ANTHROPIC_API_KEY/) });

    // A finished run on disk, investigated with a scripted model.
    const statsEmpty = statsOf([]);
    await store.save({
      formatVersion: 1,
      config: runConfig.parse({ rate: 1, durationSec: 1 }),
      summary: {
        runId: 'done1', status: 'COMPLETED', startedAt: 1, endedAt: 2, targetRate: 1, achievedRate: 1, p99LatenessMs: 0, generatorLimited: false,
        scheduled: 1, sent: 1, created: 1, createErrors: [], rejected: [], incomplete: [], stateCounts: { FILLED: 1 }, decodeErrors: 0,
        figures: { toOmsAck: statsEmpty, toMarket: statsEmpty, toLive: statsEmpty, toFirstFill: statsEmpty, toFilled: statsEmpty },
        deltas: { omsAck: statsEmpty, omsToMarket: statsEmpty, marketRoundTrip: statsEmpty },
      },
      series: [],
      samples: [],
    });
    const model = fakeModel([toolStep('runSummary', {}, 'c1'), textStep('All orders filled.')]);
    const on = createApp({ engine, store, extend: (a) => mountInvestigations(a, { config: aiConfig, store, engine, env: { ANTHROPIC_API_KEY: 'k' }, model }) });
    expect(await (await on.request('/mc/ai/status')).json()).toMatchObject({ available: true });
    expect((await on.request('/mc/runs/nope/investigate', post({ prompt: 'why?' }))).status).toBe(404);
    expect((await on.request('/mc/runs/done1/investigate', post({ prompt: '' }))).status).toBe(422);

    const res = await on.request('/mc/runs/done1/investigate', post({ prompt: 'How did it go?' }));
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const text = await res.text();
    const events = [...text.matchAll(/event: (\w+)\ndata: (.*)\n/g)].map((m) => ({ event: m[1], data: JSON.parse(m[2]) }));
    expect(events[0]).toMatchObject({ event: 'start', data: { invId: expect.any(String) } });
    expect(events.slice(1).map((e) => e.data.type)).toEqual(['ai:tool-call', 'ai:tool-result', 'ai:message', 'ai:done']);
    expect(events.find((e) => e.data.type === 'ai:tool-result')!.data.output).toContain('done1');

    // A stored run whose oms-core host is no longer allowlisted is not investigated (its tools would call it).
    const narrowed = createApp({ engine, store, extend: (a) => mountInvestigations(a, { config: { ...aiConfig, allowedHosts: ['127.0.0.1'] }, store, engine, env: { ANTHROPIC_API_KEY: 'k' }, model }) });
    const refused = await narrowed.request('/mc/runs/done1/investigate', post({ prompt: 'again' }));
    expect(refused.status).toBe(422);
    expect(await refused.json()).toMatchObject({ check: 'allowlist' });
  });

  it('stream pushes a snapshot at least once per second', async () => {
    const source = new InMemoryEventSource();
    const oms = await healthyOms(source);
    const registry = await stub((_r, res) => json(res, 200, []));
    const { app: a, engine } = app({ source, registryUrl: registry.url });

    const started = await a.request('/mc/runs', post({ omsBaseUrl: oms.url, rate: 10, durationSec: 3, completionTimeoutSec: 1 }));
    expect(started.status).toBe(201);
    const { runId } = await started.json();
    expect((await a.request('/mc/runs/' + runId)).status).toBe(200);
    expect((await a.request('/mc/runs', post({ omsBaseUrl: oms.url, rate: 1, durationSec: 1 }))).status).toBe(409);

    const t0 = Date.now();
    const res = await a.request(`/mc/runs/${runId}/stream`);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    const snapshotTimes: number[] = [];
    while (Date.now() - t0 < 3200) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      text += chunk;
      for (const _ of chunk.matchAll(/event: snapshot/g)) snapshotTimes.push(Date.now() - t0);
    }
    expect(snapshotTimes.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < snapshotTimes.length; i++) expect(snapshotTimes[i] - snapshotTimes[i - 1]).toBeLessThanOrEqual(1100);
    const first = JSON.parse(text.split('data: ')[1].split('\n')[0]);
    expect(first.summary.runId).toBe(runId);
    expect(Array.isArray(first.series)).toBe(true);

    // Read on until the run ends; the stream closes with a `done` event.
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }
    expect(text).toMatch(/event: done/);
    await engine.idle();

    const list = await (await a.request('/mc/runs')).json();
    expect(list[0]).toMatchObject({ runId, readable: true, summary: { status: 'COMPLETED', sent: 30 } });
    const samples = await (await a.request(`/mc/runs/${runId}/samples?sort=toFilled&limit=5`)).json();
    expect(samples).toHaveLength(5);
    expect(samples[0].figures.toFilled).toBeGreaterThanOrEqual(samples[4].figures.toFilled);
  }, 15_000);
});
