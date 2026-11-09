import { LoadGenerator, type GeneratorEvents } from '../../src/server/run/LoadGenerator';
import { OmsClient } from '../../src/server/oms/OmsClient';
import { systemClock } from '../../src/server/clock';
import { orderTemplate } from '../../src/shared/types';
import { FakeClock } from '../support/FakeClock';
import { json, stubHttp, type StubServer } from '../support/stubHttp';

function recorder() {
  const sends: { seq: number; clOrdId: string; scheduledAt: number; sentAt: number }[] = [];
  const acks: { clOrdId: string; orderId: string }[] = [];
  const errors: { clOrdId: string; status: number | null }[] = [];
  const events: GeneratorEvents = {
    onSend: (seq, clOrdId, scheduledAt, sentAt) => sends.push({ seq, clOrdId, scheduledAt, sentAt }),
    onAck: (clOrdId, orderId) => acks.push({ clOrdId, orderId }),
    onError: (clOrdId, e) => errors.push({ clOrdId, status: e.status }),
  };
  return { sends, acks, errors, events };
}

describe('LoadGenerator (AC-1)', () => {
  let stub: StubServer;
  afterEach(async () => stub?.close());

  it('sends rate×duration requests on schedule despite slow responses', async () => {
    let n = 0;
    stub = await stubHttp(async (_req, res) => {
      const id = `O${++n}`;
      await new Promise((r) => setTimeout(r, 1000));
      json(res, 201, { id });
    });
    const rec = recorder();
    const template = orderTemplate.parse({ symbol: 'MSFT' });
    const gen = new LoadGenerator({
      runId: 'r1',
      sessionId: 'mc-r1',
      rate: 50,
      durationSec: 2,
      template,
      client: new OmsClient(stub.url, { timeoutMs: 5000 }),
      clock: systemClock,
      events: rec.events,
    });
    await gen.run();
    const result = gen.result();

    expect(stub.requests.length).toBeGreaterThanOrEqual(99);
    expect(stub.requests.length).toBeLessThanOrEqual(101);
    expect(stub.requests.every((r) => r.method === 'POST' && r.url === '/api/command/execute')).toBe(true);
    const bodies = stub.requests.map((r) => JSON.parse(r.body));
    expect(new Set(bodies.map((b) => b.order.clOrdId)).size).toBe(stub.requests.length);
    expect(bodies[0]).toMatchObject({ type: 'OrderCreateCmd', version: '1.0.0', order: { ...template, sessionId: 'mc-r1', clOrdId: expect.stringMatching(/^r1-\d+$/) } });
    expect(bodies[0].order.price).toBeUndefined();

    const lateness = rec.sends.map((s) => s.sentAt - s.scheduledAt);
    expect(Math.max(...lateness)).toBeLessThanOrEqual(50);
    expect(rec.acks).toHaveLength(stub.requests.length);
    expect(result.targetRate).toBe(50);
    expect(result.achievedRate!).toBeGreaterThan(47.5);
    expect(result.generatorLimited).toBe(false);
  }, 15_000);

  it('flags generator-limited below 95 percent', async () => {
    stub = await stubHttp((_req, res) => json(res, 201, { id: 'O' }));
    const client = new OmsClient(stub.url, { timeoutMs: 5000 });
    const template = orderTemplate.parse({});

    // On schedule: one tick every 100 ms delivers each order exactly on time.
    const onTime = new FakeClock(0);
    const g1 = new LoadGenerator({ runId: 'a', sessionId: 'mc-a', rate: 10, durationSec: 1, template, client, clock: onTime, events: recorder().events, manualTicks: true });
    g1.begin();
    for (let i = 0; i < 10; i++) {
      g1.tick();
      onTime.advance(100);
    }
    await g1.settled();
    expect(g1.result()).toMatchObject({ achievedRate: 10, generatorLimited: false, sent: 10 });

    // Stalled: the generator only gets to run after 1 s, then sends everything late.
    const stalled = new FakeClock(0);
    const g2 = new LoadGenerator({ runId: 'b', sessionId: 'mc-b', rate: 10, durationSec: 1, template, client, clock: stalled, events: recorder().events, manualTicks: true });
    g2.begin();
    stalled.advance(1000);
    g2.tick();
    await g2.settled();
    const r2 = g2.result();
    expect(r2.sent).toBe(10);
    expect(r2.achievedRate!).toBeLessThan(9.5);
    expect(r2.generatorLimited).toBe(true);
  });

  it('reports create errors and timeouts through onError', async () => {
    let n = 0;
    stub = await stubHttp(async (_req, res) => {
      n++;
      if (n === 1) return json(res, 400, { title: 'Bad Request', detail: 'orderQty' });
      if (n === 2) return json(res, 503, { title: 'Unavailable' });
      if (n === 3) return void (await new Promise((r) => setTimeout(r, 1500)), json(res, 201, { id: 'late' }));
      json(res, 201, { id: `O${n}` });
    });
    const rec = recorder();
    const gen = new LoadGenerator({
      runId: 'e',
      sessionId: 'mc-e',
      rate: 20,
      durationSec: 1,
      template: orderTemplate.parse({}),
      client: new OmsClient(stub.url, { timeoutMs: 300 }),
      clock: systemClock,
      events: rec.events,
    });
    await gen.run();
    expect(rec.errors.map((e) => e.status)).toEqual([400, 503, null]);
    expect(rec.acks).toHaveLength(17);
  }, 10_000);
});
