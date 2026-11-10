/**
 * A synthetic stream for the load harness (SPEC-0057 AC-9, AC-10). It stands in for the RSocket
 * service and sends `rate` events per second for `duration` seconds, cycling through `keys` distinct
 * rows. Each event is decoded from JSON, as RSocket payloads are, so the decoding cost is included,
 * and its receipt time is kept so the harness can measure each event's ingest lag.
 */
import { StreamingServiceLike } from '../components/StreamingBlotter';
import {
  ExecutionEvent,
  OrderEvent,
  StreamFilter,
  StreamingCallbacks,
  StreamingConnectionState,
  StreamSubscription,
} from '../types/streaming';
import { FilterCondition } from '../types/types';
import { LoadParams } from './metrics';

const SYMBOLS = ['AAPL', 'MSFT', 'INTC', 'NVDA', 'AMZN'];
const TICK_MS = 10;

export class SyntheticStreamingService implements StreamingServiceLike {
  /** Receipt time of event i (performance.now()), for its lag once the grid shows it. */
  readonly receivedAt: Float64Array;
  sent = 0;
  startedAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly total: number;

  constructor(private readonly params: LoadParams, private readonly onDone: () => void) {
    this.total = Math.max(0, Math.floor(params.rate * params.duration));
    this.receivedAt = new Float64Array(this.total);
  }

  getConnectionState(): StreamingConnectionState {
    return 'connected';
  }

  addConnectionStateListener(_listener: (state: StreamingConnectionState) => void): void {}

  removeConnectionStateListener(_listener: (state: StreamingConnectionState) => void): void {}

  async connect(): Promise<void> {}

  disconnect(): void {
    this.stop();
  }

  convertToStreamFilter(_filters: FilterCondition[], includeSnapshot = true, snapshotLimit?: number): StreamFilter {
    return { logicalOperator: 'AND', filters: [], includeSnapshot, snapshotLimit };
  }

  subscribeToOrders(filter: StreamFilter, callbacks: StreamingCallbacks<OrderEvent>): StreamSubscription {
    return this.start(filter, callbacks as StreamingCallbacks<any>, 'Order');
  }

  subscribeToExecutions(filter: StreamFilter, callbacks: StreamingCallbacks<ExecutionEvent>): StreamSubscription {
    return this.start(filter, callbacks as StreamingCallbacks<any>, 'Execution');
  }

  private start(filter: StreamFilter, callbacks: StreamingCallbacks<any>, domain: string): StreamSubscription {
    this.stop();
    if (filter.includeSnapshot) {
      // No snapshot rows: the run measures live updates. The marker ends the snapshot at once.
      callbacks.onNext({ eventType: 'SNAPSHOT_END', snapshotTotal: 0 });
    }
    this.sent = 0;
    this.startedAt = performance.now();
    // Each tick sends what is due by now, so the rate holds even when ticks are late; a busy main
    // thread then gets the backlog all at once, as a real socket would deliver it.
    this.timer = setInterval(() => {
      const due = Math.min(this.total, Math.floor(((performance.now() - this.startedAt) * this.params.rate) / 1000));
      while (this.sent < due) {
        const json = this.eventJson(this.sent, domain);
        this.receivedAt[this.sent] = performance.now();
        this.sent++;
        callbacks.onNext(JSON.parse(json));
      }
      if (this.sent >= this.total) {
        this.stop();
        this.onDone();
      }
    }, TICK_MS);
    return { unsubscribe: () => this.stop(), isActive: () => this.timer !== null };
  }

  private stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private eventJson(i: number, domain: string): string {
    const key = i % this.params.keys;
    const orderId = `LOAD-${key}`;
    const transactTime = new Date().toISOString();
    if (domain === 'Execution') {
      const execId = `X-${key}`;
      return JSON.stringify({
        eventType: 'NEW',
        execId,
        orderId,
        timestamp: transactTime,
        execution: {
          execId, orderId, execType: 'F', lastQty: 10, lastPx: 100 + (i % 50) / 10,
          cumQty: (i % 10) * 10, leavesQty: 100 - (i % 10) * 10, avgPx: 100 + (i % 7) / 10, transactTime,
        },
      });
    }
    return JSON.stringify({
      eventType: 'UPDATE',
      orderId,
      eventId: i < this.params.keys ? 1 : 2,
      timestamp: transactTime,
      order: {
        orderId, clOrdId: `C-${key}`, symbol: SYMBOLS[key % SYMBOLS.length], side: key % 2 ? 'SELL' : 'BUY',
        ordType: 'LIMIT', state: 'LIVE', timeInForce: 'DAY', orderQty: 100, cumQty: i % 100,
        leavesQty: 100 - (i % 100), price: 100 + (i % 50) / 10, transactTime,
      },
    });
  }
}
