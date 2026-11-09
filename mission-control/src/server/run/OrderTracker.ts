import { DELTAS, TERMINAL_STATES, type Delta, type Figure, type FigureStats, type OrderSample, type TrackerEvent } from '../../shared/types.js';
import type { Clock } from '../clock.js';
import type { RunStats } from './RunStats.js';
import { statsOf } from './RunStats.js';

interface Tracked {
  sample: OrderSample;
  seenOrderEvents: Set<number>;
  seenExecutions: Set<string>;
  lastState?: string;
  completed: boolean;
  /** The 201 arrived: the order exists, so its figures count in the run's statistics. */
  confirmed: boolean;
  /** Statistics held back until the 201 arrives (the outbox can publish before the HTTP response). */
  pending: (() => void)[];
}

const usToMs = (us: number) => us / 1000;

/**
 * Follows the orders of one run (design: OrderTracker). Messages are matched by the run's
 * sessionId and the order's clOrdId (D4), never by the 201's orderId, because the outbox can
 * publish before the HTTP response is handled. Redeliveries are dropped by
 * (orderId, eventId) and (orderId, execId, orderVersion) (AC-3).
 *
 * An order counts in the run's statistics only once its create is confirmed by the 201. Events
 * that arrive earlier are held; if the create then fails (4xx, 5xx, timeout), the order is
 * dropped entirely and contributes to no figure (AC-5).
 */
export class OrderTracker {
  private readonly byClOrdId = new Map<string, Tracked>();
  private executions = 0;

  constructor(
    private readonly sessionId: string,
    private readonly clock: Clock,
    private readonly stats: RunStats,
  ) {}

  register(seq: number, clOrdId: string, scheduledAt: number): void {
    this.byClOrdId.set(clOrdId, {
      sample: { seq, clOrdId, scheduledAt, timeline: [], figures: {}, deltas: {} },
      seenOrderEvents: new Set(),
      seenExecutions: new Set(),
      completed: false,
      confirmed: false,
      pending: [],
    });
  }

  markSent(clOrdId: string, sentAt: number): void {
    const t = this.byClOrdId.get(clOrdId);
    if (t) t.sample.sentAt = sentAt;
  }

  markAck(clOrdId: string, orderId: string, ackAt: number): void {
    const t = this.byClOrdId.get(clOrdId);
    if (!t) return;
    t.sample.orderId ??= orderId;
    if (t.sample.ackAt === undefined && !t.sample.error) {
      t.sample.ackAt = ackAt;
      t.confirmed = true;
      this.setFigure(t, 'toOmsAck', ackAt);
      for (const record of t.pending.splice(0)) record();
    }
  }

  markError(clOrdId: string, error: NonNullable<OrderSample['error']>): void {
    const t = this.byClOrdId.get(clOrdId);
    if (!t || t.confirmed) return;
    t.sample.error = error;
    // Not tracked (AC-5): forget whatever arrived before the failure.
    t.pending = [];
    t.lastState = undefined;
    Object.assign(t.sample, { timeline: [], figures: {}, deltas: {}, finalState: undefined, rejectReason: undefined });
  }

  onEvent(ev: TrackerEvent): void {
    if (ev.sessionId !== this.sessionId || !ev.clOrdId) return;
    const t = this.byClOrdId.get(ev.clOrdId);
    if (!t || t.sample.error) return;
    const seen = this.clock.now();
    t.sample.orderId ??= ev.orderId;

    if (ev.kind === 'execution') {
      const key = `${ev.execId}|${ev.orderVersion ?? ''}`;
      if (t.seenExecutions.has(key)) return;
      t.seenExecutions.add(key);
      this.executions++;
      this.setFigure(t, 'toFirstFill', seen);
      return;
    }

    if (ev.eventId !== null) {
      if (t.seenOrderEvents.has(ev.eventId)) return;
      t.seenOrderEvents.add(ev.eventId);
    }
    this.applyDeltas(t.sample, ev);
    if (ev.rejectReason) t.sample.rejectReason = ev.rejectReason;
    const state = ev.state;
    if (!state || state === t.lastState) return;
    t.lastState = state;
    t.sample.timeline.push({ state, seenAt: seen, eventId: ev.eventId });
    t.sample.finalState = state;
    if (state === 'UNACK') this.setFigure(t, 'toMarket', seen);
    if (state === 'LIVE') this.setFigure(t, 'toLive', seen);
    if (state === 'FILLED') this.setFigure(t, 'toFilled', seen);
    if (TERMINAL_STATES.has(state) && !t.completed) {
      t.completed = true;
      this.toStats(t, () => this.stats.recordCompleted(seen));
    }
  }

  samples(): OrderSample[] {
    return [...this.byClOrdId.values()].map((t) => t.sample).sort((a, b) => a.seq - b.seq);
  }

  /** True when every order that was created is in a terminal state (failed creates do not count). */
  allTerminal(): boolean {
    return this.incomplete().length === 0;
  }

  /** Orders that were sent (or acknowledged) without error and have not reached a terminal state. */
  incomplete(): { clOrdId: string; orderId?: string; lastState?: string }[] {
    return [...this.byClOrdId.values()]
      .filter((t) => !t.sample.error && (t.sample.sentAt !== undefined || t.sample.ackAt !== undefined) && !t.completed)
      .map((t) => ({ clOrdId: t.sample.clOrdId, orderId: t.sample.orderId, lastState: t.lastState }));
  }

  rejected(): { clOrdId: string; orderId?: string; reason?: string }[] {
    return [...this.byClOrdId.values()]
      .filter((t) => t.lastState === 'REJ')
      .map((t) => ({ clOrdId: t.sample.clOrdId, orderId: t.sample.orderId, reason: t.sample.rejectReason }));
  }

  stateCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const t of this.byClOrdId.values()) if (t.lastState) counts[t.lastState] = (counts[t.lastState] ?? 0) + 1;
    return counts;
  }

  executionCount(): number {
    return this.executions;
  }

  deltaStats(): Record<Delta, FigureStats> {
    const samples = this.samples();
    return Object.fromEntries(
      DELTAS.map((d) => [d, statsOf(samples.map((s) => s.deltas[d]).filter((v): v is number => v !== undefined))]),
    ) as Record<Delta, FigureStats>;
  }

  private setFigure(t: Tracked, figure: Figure, at: number): void {
    if (t.sample.figures[figure] !== undefined) return;
    const value = at - t.sample.scheduledAt;
    t.sample.figures[figure] = value;
    this.toStats(t, () => this.stats.recordFigure(figure, value, at));
  }

  private toStats(t: Tracked, record: () => void): void {
    if (t.confirmed) record();
    else t.pending.push(record);
  }

  private applyDeltas(sample: OrderSample, ev: Extract<TrackerEvent, { kind: 'order' }>): void {
    const { orderReceivedTime: rcv, ackTime: ack, marketSendTime: send, marketAckTime: mack } = ev;
    if (rcv !== null && ack !== null) sample.deltas.omsAck = usToMs(ack - rcv);
    if (rcv !== null && send !== null) sample.deltas.omsToMarket = usToMs(send - rcv);
    if (send !== null && mack !== null) sample.deltas.marketRoundTrip = usToMs(mack - send);
  }
}
