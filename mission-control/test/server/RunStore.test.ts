import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RunStore, type StoredRun } from '../../src/server/run/RunStore';
import { runConfig, type RunSummary } from '../../src/shared/types';
import { statsOf } from '../../src/server/run/RunStats';

function finishedRun(runId: string): StoredRun {
  const stats = statsOf([10, 20, 30]);
  const empty = statsOf([]);
  const summary: RunSummary = {
    runId,
    label: 'baseline',
    status: 'COMPLETED',
    startedAt: 1000,
    endedAt: 5000,
    targetRate: 10,
    achievedRate: 9.98,
    p99LatenessMs: 2.5,
    generatorLimited: false,
    scheduled: 2,
    sent: 2,
    created: 2,
    createErrors: [],
    rejected: [],
    incomplete: [{ clOrdId: `${runId}-1`, orderId: 'O2', lastState: 'LIVE' }],
    stateCounts: { FILLED: 1, LIVE: 1 },
    decodeErrors: 0,
    figures: { toOmsAck: stats, toMarket: stats, toLive: stats, toFirstFill: stats, toFilled: empty },
    deltas: { omsAck: stats, omsToMarket: stats, marketRoundTrip: stats },
  };
  return {
    formatVersion: 1,
    config: runConfig.parse({ rate: 10, durationSec: 1 }),
    summary,
    series: [{ t: 0, submitted: 2, completed: 1, p: { toFilled: { p50: 75, p95: 75, p99: 75 } } }],
    samples: [
      { seq: 0, clOrdId: `${runId}-0`, orderId: 'O1', scheduledAt: 1000, sentAt: 1001, ackAt: 1005, timeline: [{ state: 'FILLED', seenAt: 1075, eventId: 3 }], figures: { toOmsAck: 5, toFilled: 75 }, deltas: { omsAck: 2.5 }, finalState: 'FILLED' },
      { seq: 1, clOrdId: `${runId}-1`, orderId: 'O2', scheduledAt: 1100, sentAt: 1100.4, timeline: [], figures: {}, deltas: {} },
    ],
  };
}

describe('RunStore (AC-7)', () => {
  let dir: string;
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'mc-store-'))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('a saved run reads back identically from a new store', async () => {
    const run = finishedRun('r1');
    await new RunStore(dir).save(run);

    const reopened = new RunStore(dir);
    const list = await reopened.list();
    expect(list).toEqual([{ runId: 'r1', readable: true, summary: run.summary }]);
    expect(await reopened.get('r1')).toEqual(run);
  });

  it('lists newest first and reports unreadable runs without failing', async () => {
    const a = finishedRun('a');
    const b = finishedRun('b');
    b.summary.startedAt = 9000;
    const store = new RunStore(dir);
    await store.save(a);
    await store.save(b);
    mkdirSync(join(dir, 'broken'));
    writeFileSync(join(dir, 'broken', 'run.json'), '{not json');
    mkdirSync(join(dir, 'future'));
    writeFileSync(join(dir, 'future', 'run.json'), JSON.stringify({ formatVersion: 2 }));

    const list = await store.list();
    expect(list.filter((r) => r.readable).map((r) => r.runId)).toEqual(['b', 'a']);
    expect(list.filter((r) => !r.readable).map((r) => r.runId).sort()).toEqual(['broken', 'future']);
    expect(await store.get('broken')).toBeNull();
    expect(await store.get('../etc')).toBeNull();
    expect(await store.get('missing')).toBeNull();
  });
});
