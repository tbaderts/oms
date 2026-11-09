import type { EventSource } from '../../src/server/kafka/EventConsumer';
import type { TrackerEvent } from '../../src/shared/types';

/** Stands in for Kafka: tests push decoded events; `failJoin` simulates a group that never joins. */
export class InMemoryEventSource implements EventSource {
  decodeErrors = 0;
  started: string[] = [];
  stopped = 0;
  private listener: ((ev: TrackerEvent) => void) | null = null;

  constructor(private readonly failJoin = false) {}

  async start(groupId: string, onEvent: (ev: TrackerEvent) => void): Promise<void> {
    if (this.failJoin) throw new Error(`consumer group ${groupId} did not join`);
    this.started.push(groupId);
    this.listener = onEvent;
  }

  async stop(): Promise<void> {
    this.stopped++;
    this.listener = null;
  }

  push(ev: TrackerEvent): void {
    this.listener?.(ev);
  }
}

export function orderEvent(sessionId: string, clOrdId: string, orderId: string, eventId: number, state: string, rejectReason: string | null = null): TrackerEvent {
  return { kind: 'order', sessionId, clOrdId, orderId, eventId, state, rejectReason, orderReceivedTime: null, ackTime: null, marketSendTime: null, marketAckTime: null };
}

export function execEvent(sessionId: string, clOrdId: string, orderId: string, execId: string, orderVersion: number): TrackerEvent {
  return { kind: 'execution', sessionId, clOrdId, orderId, execId, orderVersion, state: 'FILLED' };
}
