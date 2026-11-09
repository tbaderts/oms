import type { OrderTemplate } from '../../shared/types.js';
import type { Clock } from '../clock.js';
import type { OmsClient } from '../oms/OmsClient.js';
import { nearestRank } from './RunStats.js';

export const TICK_MS = 5;
export const LIMITED_RATE_RATIO = 0.95;
export const LIMITED_P99_LATENESS_MS = 50;

export interface GeneratorEvents {
  onSend(seq: number, clOrdId: string, scheduledAt: number, sentAt: number): void;
  onAck(clOrdId: string, orderId: string, at: number): void;
  onError(clOrdId: string, error: { status: number | null; message: string; body?: string }): void;
}

export interface GeneratorOptions {
  runId: string;
  sessionId: string;
  rate: number;
  durationSec: number;
  template: OrderTemplate;
  client: Pick<OmsClient, 'create'>;
  clock: Clock;
  events: GeneratorEvents;
  /** Tests drive `tick()` themselves instead of the 5 ms interval. */
  manualTicks?: boolean;
}

export interface GeneratorResult {
  targetRate: number;
  scheduled: number;
  sent: number;
  achievedRate: number | null;
  p99LatenessMs: number | null;
  generatorLimited: boolean;
}

/**
 * Open-loop order generator (design D7). Order i is due at start + i × 1000/rate. A 5 ms tick sends
 * every due order without awaiting the response, so a slow oms-core never delays a later send;
 * the lateness of every send is kept, and a run that cannot keep the schedule is flagged.
 */
export class LoadGenerator {
  private readonly total: number;
  private readonly interval: number;
  private startAt = 0;
  private next = 0;
  private stopped = false;
  private timer: NodeJS.Timeout | null = null;
  private readonly inFlight = new Set<Promise<void>>();
  private readonly lateness: number[] = [];
  private lastSentAt: number | null = null;
  private doneResolve: (() => void) | null = null;

  constructor(private readonly o: GeneratorOptions) {
    this.total = Math.round(o.rate * o.durationSec);
    this.interval = 1000 / o.rate;
  }

  /** Starts sending and resolves once every order was sent (or the run stopped) and every response settled. */
  async run(): Promise<void> {
    const done = new Promise<void>((r) => (this.doneResolve = r));
    this.begin();
    await done;
    await this.settled();
  }

  begin(): void {
    this.startAt = this.o.clock.now();
    if (!this.o.manualTicks) {
      this.tick();
      this.timer = setInterval(() => this.tick(), TICK_MS);
    }
  }

  tick(): void {
    const now = this.o.clock.now();
    while (!this.stopped && this.next < this.total && this.startAt + this.next * this.interval <= now) {
      this.send(this.next++);
    }
    if (this.stopped || this.next >= this.total) this.finishSending();
  }

  stop(): void {
    this.stopped = true;
    this.finishSending();
  }

  async settled(): Promise<void> {
    while (this.inFlight.size) await Promise.all([...this.inFlight]);
  }

  result(): GeneratorResult {
    const sent = this.lateness.length;
    let achievedRate: number | null = null;
    if (sent > 0 && this.lastSentAt !== null) {
      achievedRate = Math.round((sent / (this.lastSentAt - this.startAt + this.interval)) * 1000 * 1000) / 1000;
    }
    const sorted = [...this.lateness].sort((a, b) => a - b);
    const p99LatenessMs = sent ? nearestRank(sorted, 99) : null;
    const generatorLimited =
      sent > 0 && ((achievedRate ?? 0) < LIMITED_RATE_RATIO * this.o.rate || (p99LatenessMs ?? 0) > LIMITED_P99_LATENESS_MS);
    return { targetRate: this.o.rate, scheduled: this.total, sent, achievedRate, p99LatenessMs, generatorLimited };
  }

  private send(seq: number): void {
    const scheduledAt = this.startAt + seq * this.interval;
    const clOrdId = `${this.o.runId}-${seq}`;
    const sentAt = this.o.clock.now();
    this.lateness.push(sentAt - scheduledAt);
    this.lastSentAt = sentAt;
    this.o.events.onSend(seq, clOrdId, scheduledAt, sentAt);
    const p = this.o.client
      .create({ type: 'OrderCreateCmd', version: '1.0.0', order: { ...this.o.template, sessionId: this.o.sessionId, clOrdId } })
      .then((r) => {
        if (r.ok) this.o.events.onAck(clOrdId, r.orderId, this.o.clock.now());
        else this.o.events.onError(clOrdId, { status: r.status, message: r.message, body: r.body });
      })
      .finally(() => this.inFlight.delete(p));
    this.inFlight.add(p);
  }

  private finishSending(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.doneResolve?.();
    this.doneResolve = null;
  }
}
