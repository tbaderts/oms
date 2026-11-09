import { OrderTracker } from '../../src/server/run/OrderTracker';
import { RunStats } from '../../src/server/run/RunStats';
import type { TrackerEvent } from '../../src/shared/types';
import { FakeClock } from '../support/FakeClock';

const SESSION = 'mc-r1';

function orderMsg(over: Partial<Extract<TrackerEvent, { kind: 'order' }>> = {}): TrackerEvent {
  return {
    kind: 'order',
    sessionId: SESSION,
    clOrdId: 'r1-0',
    orderId: 'O1',
    eventId: 1,
    state: 'UNACK',
    rejectReason: null,
    orderReceivedTime: null,
    ackTime: null,
    marketSendTime: null,
    marketAckTime: null,
    ...over,
  };
}

function execMsg(over: Partial<Extract<TrackerEvent, { kind: 'execution' }>> = {}): TrackerEvent {
  return { kind: 'execution', sessionId: SESSION, clOrdId: 'r1-0', orderId: 'O1', execId: 'O1-F1', orderVersion: 3, state: 'FILLED', ...over };
}

function setup() {
  const clock = new FakeClock(10_000);
  const stats = new RunStats(10_000);
  const tracker = new OrderTracker(SESSION, clock, stats);
  tracker.register(0, 'r1-0', 10_000);
  return { clock, stats, tracker };
}

/** 201 at +5, UNACK at +20, LIVE at +40, fill at +70, FILLED at +75 (ms after scheduled). */
function playHappyPath({ clock, tracker }: ReturnType<typeof setup>) {
  clock.t = 10_001;
  tracker.markSent('r1-0', clock.now());
  clock.t = 10_005;
  tracker.markAck('r1-0', 'O1', clock.now());
  clock.t = 10_020;
  tracker.onEvent(orderMsg({ eventId: 1, state: 'UNACK', orderReceivedTime: 1_000_000, ackTime: 1_002_500, marketSendTime: 1_004_000 }));
  clock.t = 10_040;
  tracker.onEvent(orderMsg({ eventId: 2, state: 'LIVE', orderReceivedTime: 1_000_000, ackTime: 1_002_500, marketSendTime: 1_004_000, marketAckTime: 1_016_000 }));
  clock.t = 10_070;
  tracker.onEvent(execMsg());
  clock.t = 10_075;
  tracker.onEvent(orderMsg({ eventId: 3, state: 'FILLED', orderReceivedTime: 1_000_000, ackTime: 1_002_500, marketSendTime: 1_004_000, marketAckTime: 1_016_000 }));
}

describe('OrderTracker (AC-2)', () => {
  it('builds timeline, figures and checkpoint deltas', () => {
    const h = setup();
    playHappyPath(h);
    const [s] = h.tracker.samples();
    expect(s.orderId).toBe('O1');
    expect(s.timeline).toEqual([
      { state: 'UNACK', seenAt: 10_020, eventId: 1 },
      { state: 'LIVE', seenAt: 10_040, eventId: 2 },
      { state: 'FILLED', seenAt: 10_075, eventId: 3 },
    ]);
    expect(s.figures).toEqual({ toOmsAck: 5, toMarket: 20, toLive: 40, toFirstFill: 70, toFilled: 75 });
    // µs → ms: ackTime − orderReceivedTime, marketSendTime − orderReceivedTime, marketAckTime − marketSendTime
    expect(s.deltas).toEqual({ omsAck: 2.5, omsToMarket: 4, marketRoundTrip: 12 });
    expect(s.finalState).toBe('FILLED');
    expect(h.tracker.allTerminal()).toBe(true);
    expect(h.stats.figureStats().toFilled).toMatchObject({ count: 1, p50: 75 });
    expect(h.tracker.stateCounts()).toEqual({ FILLED: 1 });
  });

  it('ignores messages of other sessions', () => {
    const h = setup();
    h.tracker.onEvent(orderMsg({ sessionId: 'someone-else' }));
    h.tracker.onEvent(orderMsg({ clOrdId: 'r1-999' }));
    h.tracker.onEvent(orderMsg({ sessionId: null }));
    h.tracker.onEvent(execMsg({ sessionId: 'someone-else' }));
    const [s] = h.tracker.samples();
    expect(s.timeline).toEqual([]);
    expect(s.figures).toEqual({});
    expect(h.stats.figureStats().toMarket.count).toBe(0);
  });

  it('counts a venue reject with its reason and no fill figures', () => {
    const h = setup();
    h.tracker.markAck('r1-0', 'O1', 10_003);
    h.tracker.onEvent(orderMsg({ eventId: 1, state: 'UNACK' }));
    h.tracker.onEvent(orderMsg({ eventId: 2, state: 'REJ', rejectReason: 'Unknown symbol ZZZ' }));
    expect(h.tracker.rejected()).toEqual([{ clOrdId: 'r1-0', orderId: 'O1', reason: 'Unknown symbol ZZZ' }]);
    const [s] = h.tracker.samples();
    expect(s.figures.toFilled).toBeUndefined();
    expect(s.figures.toLive).toBeUndefined();
  });

  it('a failed create is not tracked', () => {
    const h = setup();
    h.tracker.markError('r1-0', { status: 503, message: 'HTTP 503', body: 'down' });
    h.tracker.onEvent(orderMsg());
    const [s] = h.tracker.samples();
    expect(s.error).toEqual({ status: 503, message: 'HTTP 503', body: 'down' });
    expect(s.timeline).toEqual([]);
    expect(h.tracker.allTerminal()).toBe(true);
    expect(h.tracker.incomplete()).toEqual([]);
  });

  it('a create that fails after its events arrived contributes nothing (AC-5)', () => {
    const h = setup();
    h.tracker.markSent('r1-0', 10_001);
    // The outbox published before the HTTP response; the request then timed out.
    h.clock.t = 10_020;
    h.tracker.onEvent(orderMsg({ eventId: 1, state: 'UNACK', orderReceivedTime: 1_000_000, ackTime: 1_002_000 }));
    h.clock.t = 10_050;
    h.tracker.onEvent(orderMsg({ eventId: 2, state: 'FILLED' }));
    h.tracker.markError('r1-0', { status: null, message: 'timeout after 300 ms' });

    const [s] = h.tracker.samples();
    expect(s.figures).toEqual({});
    expect(s.deltas).toEqual({});
    for (const f of Object.values(h.stats.figureStats())) expect(f.count).toBe(0);
    expect(h.stats.series(12_000).every((p) => p.completed === 0)).toBe(true);
    expect(h.tracker.stateCounts()).toEqual({});
    expect(h.tracker.incomplete()).toEqual([]);
    expect(h.tracker.deltaStats().omsAck.count).toBe(0);
  });

  it('events that arrive before the 201 count once the 201 arrives', () => {
    const h = setup();
    h.tracker.markSent('r1-0', 10_001);
    h.clock.t = 10_020;
    h.tracker.onEvent(orderMsg({ eventId: 1, state: 'UNACK' }));
    expect(h.stats.figureStats().toMarket.count).toBe(0);
    h.tracker.markAck('r1-0', 'O1', 10_030);
    expect(h.stats.figureStats().toMarket).toMatchObject({ count: 1, p50: 20 });
    expect(h.stats.figureStats().toOmsAck).toMatchObject({ count: 1, p50: 30 });
  });

  it('lists orders without a terminal state as incomplete with their last state', () => {
    const h = setup();
    h.tracker.markAck('r1-0', 'O1', 10_003);
    h.tracker.onEvent(orderMsg({ eventId: 2, state: 'LIVE' }));
    expect(h.tracker.allTerminal()).toBe(false);
    expect(h.tracker.incomplete()).toEqual([{ clOrdId: 'r1-0', orderId: 'O1', lastState: 'LIVE' }]);
  });
});

describe('OrderTracker deduplication (AC-3)', () => {
  it('redelivered messages change nothing', () => {
    const h = setup();
    playHappyPath(h);
    const before = JSON.stringify({ s: h.tracker.samples(), f: h.stats.figureStats(), c: h.tracker.stateCounts(), series: h.stats.series(12_000) });

    h.clock.t = 11_000;
    h.tracker.onEvent(orderMsg({ eventId: 1, state: 'UNACK' }));
    h.tracker.onEvent(orderMsg({ eventId: 2, state: 'LIVE' }));
    h.tracker.onEvent(orderMsg({ eventId: 3, state: 'FILLED' }));
    h.tracker.onEvent(execMsg());
    h.tracker.onEvent(execMsg());

    const after = JSON.stringify({ s: h.tracker.samples(), f: h.stats.figureStats(), c: h.tracker.stateCounts(), series: h.stats.series(12_000) });
    expect(after).toBe(before);
    expect(h.tracker.executionCount()).toBe(1);
  });

  it('a second fill with a new execId is not a duplicate but does not move first-fill', () => {
    const h = setup();
    h.clock.t = 10_050;
    h.tracker.onEvent(execMsg({ execId: 'O1-F1', orderVersion: 3 }));
    h.clock.t = 10_090;
    h.tracker.onEvent(execMsg({ execId: 'O1-F2', orderVersion: 4 }));
    expect(h.tracker.samples()[0].figures.toFirstFill).toBe(50);
    expect(h.tracker.executionCount()).toBe(2);
  });
});
