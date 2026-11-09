import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RunEngine, RunRefusedError, ActiveRunError } from '../../src/server/run/RunEngine';
import { RunStore } from '../../src/server/run/RunStore';
import { OmsClient } from '../../src/server/oms/OmsClient';
import { systemClock } from '../../src/server/clock';
import { InMemoryEventSource, execEvent, orderEvent } from '../support/InMemoryEventSource';
import { json, stubHttp, type StubServer } from '../support/stubHttp';

/** A venue + OMS stand-in: answers creates per seq and plays the resulting Kafka events. */
async function scriptedOms(source: InMemoryEventSource) {
  let n = 0;
  return stubHttp(async (req, res) => {
    const { order } = JSON.parse(req.body);
    const seq = Number(String(order.clOrdId).split('-').pop());
    const { sessionId, clOrdId } = order;
    if (seq === 1) return json(res, 400, { title: 'Bad Request', detail: 'orderQty must be positive' });
    if (seq === 2) return json(res, 503, { title: 'Service Unavailable' });
    if (seq === 3) {
      await new Promise((r) => setTimeout(r, 800));
      return json(res, 201, { id: 'TOO-LATE' });
    }
    const id = `O${++n}`;
    const ev = (e: Parameters<InMemoryEventSource['push']>[0]) => setTimeout(() => source.push(e), 20);
    ev(orderEvent(sessionId, clOrdId, id, 1, 'UNACK'));
    if (seq === 4) {
      ev(orderEvent(sessionId, clOrdId, id, 2, 'REJ', 'Unknown symbol ZZZ'));
    } else if (seq === 5) {
      ev(orderEvent(sessionId, clOrdId, id, 2, 'LIVE')); // never fills
    } else {
      ev(orderEvent(sessionId, clOrdId, id, 2, 'LIVE'));
      ev(execEvent(sessionId, clOrdId, id, `${id}-F1`, 3));
      ev(orderEvent(sessionId, clOrdId, id, 3, 'FILLED'));
    }
    json(res, 201, { id });
  });
}

describe('RunEngine (AC-5, AC-6, AC-7)', () => {
  let dir: string;
  let oms: StubServer;
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'mc-engine-'))));
  afterEach(async () => {
    await oms?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  function engine(source: InMemoryEventSource, preflight = async () => null as { check: string; detail: string } | null) {
    return new RunEngine({
      clock: systemClock,
      store: new RunStore(dir),
      eventSource: () => source,
      client: (url, timeoutMs) => new OmsClient(url, { timeoutMs }),
      preflight,
    });
  }

  it('counts create errors, venue rejects and incomplete orders and continues', async () => {
    const source = new InMemoryEventSource();
    oms = await scriptedOms(source);
    const eng = engine(source);
    const { runId } = await eng.start({ omsBaseUrl: oms.url, rate: 10, durationSec: 1, requestTimeoutMs: 300, completionTimeoutSec: 1 });
    expect(eng.snapshot()?.summary.status).toMatch(/RUNNING|DRAINING/);
    await eng.idle();

    const run = (await new RunStore(dir).get(runId))!;
    const s = run.summary;
    expect(s.status).toBe('COMPLETED');
    expect(s.sent).toBe(10);
    expect(s.created).toBe(7);
    expect(s.createErrors.map((e) => [e.clOrdId, e.status])).toEqual([
      [`${runId}-1`, 400],
      [`${runId}-2`, 503],
      [`${runId}-3`, null],
    ]);
    expect(s.createErrors[0].body).toContain('orderQty must be positive');
    expect(s.createErrors[2].message).toMatch(/timeout/);
    expect(s.rejected).toEqual([{ clOrdId: `${runId}-4`, orderId: expect.any(String), reason: 'Unknown symbol ZZZ' }]);
    expect(s.incomplete).toEqual([{ clOrdId: `${runId}-5`, orderId: expect.any(String), lastState: 'LIVE' }]);
    expect(s.stateCounts).toEqual({ FILLED: 5, REJ: 1, LIVE: 1 });
    // Errored orders contribute to no figure; the reject and the open order not to toFilled.
    expect(s.figures.toOmsAck.count).toBe(7);
    expect(s.figures.toMarket.count).toBe(7);
    expect(s.figures.toLive.count).toBe(6);
    expect(s.figures.toFilled.count).toBe(5);
    for (const seq of [1, 2, 3]) expect(run.samples[seq].figures).toEqual({});
    expect(source.started).toEqual([`mission-control-${runId}`]);
    expect(source.stopped).toBe(1);
  }, 15_000);

  it('refuses a run whose preflight fails and sends nothing', async () => {
    const source = new InMemoryEventSource();
    oms = await scriptedOms(source);
    const eng = engine(source, async () => ({ check: 'schema-registry', detail: 'connect ECONNREFUSED' }));
    await expect(eng.start({ omsBaseUrl: oms.url, rate: 10, durationSec: 1 })).rejects.toMatchObject({ refusal: { check: 'schema-registry' } });
    expect(oms.requests).toHaveLength(0);
    expect(source.started).toEqual([]);
    expect(eng.snapshot()).toBeNull();
  });

  it('refuses a run when the consumer group cannot join', async () => {
    const source = new InMemoryEventSource(true);
    oms = await scriptedOms(source);
    const err = await engine(source).start({ omsBaseUrl: oms.url, rate: 10, durationSec: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(RunRefusedError);
    expect(err.refusal.check).toBe('kafka');
    expect(oms.requests).toHaveLength(0);
  });

  it('allows one active run at a time and stops on request', async () => {
    const source = new InMemoryEventSource();
    oms = await scriptedOms(source);
    const eng = engine(source);
    const { runId } = await eng.start({ omsBaseUrl: oms.url, rate: 20, durationSec: 30, completionTimeoutSec: 1 });
    await expect(eng.start({ omsBaseUrl: oms.url, rate: 1, durationSec: 1 })).rejects.toBeInstanceOf(ActiveRunError);
    await new Promise((r) => setTimeout(r, 300));
    expect(eng.stop(runId)).toBe(true);
    await eng.idle();
    const run = (await new RunStore(dir).get(runId))!;
    expect(run.summary.status).toBe('STOPPED');
    expect(run.summary.sent).toBeLessThan(600);
    expect(eng.stop(runId)).toBe(false);
  }, 15_000);
});
