import { SchemaRegistry } from '@kafkajs/confluent-schema-registry';
import { Kafka, logLevel, type Consumer } from 'kafkajs';
import type { TrackerEvent } from '../../shared/types.js';
import { silentLogger, type Logger } from '../log.js';

export interface Topics {
  orders: string;
  executions: string;
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' ? v : typeof v === 'bigint' ? Number(v) : null);

/**
 * Decodes Confluent-framed Avro records (magic byte + schema id) by their writer schema, fetched
 * read-only from the Schema Registry and cached (design: Events & Messaging). Never registers a
 * schema. A record that cannot be decoded is counted and yields null; the run goes on.
 */
export class RecordDecoder {
  decodeErrors = 0;
  private readonly registry: SchemaRegistry;

  constructor(
    registryUrl: string,
    private readonly topics: Topics,
    private readonly log: Logger = silentLogger,
  ) {
    this.registry = new SchemaRegistry({ host: registryUrl });
  }

  async decode(topic: string, value: Buffer | null): Promise<TrackerEvent | null> {
    if (topic !== this.topics.orders && topic !== this.topics.executions) return null;
    if (!value) return null;
    let rec: Record<string, unknown>;
    try {
      rec = (await this.registry.decode(value)) as Record<string, unknown>;
    } catch (e) {
      this.decodeErrors++;
      this.log.warn('undecodable record', { topic, err: e });
      return null;
    }
    const orderId = str(rec.orderId) ?? '';
    if (topic === this.topics.orders) {
      return {
        kind: 'order',
        sessionId: str(rec.sessionId),
        clOrdId: str(rec.clOrdId),
        orderId,
        eventId: num(rec.eventId),
        state: str(rec.state),
        rejectReason: str(rec.rejectReason),
        orderReceivedTime: num(rec.orderReceivedTime),
        ackTime: num(rec.ackTime),
        marketSendTime: num(rec.marketSendTime),
        marketAckTime: num(rec.marketAckTime),
      };
    }
    return {
      kind: 'execution',
      sessionId: str(rec.sessionId),
      clOrdId: str(rec.clOrdId),
      orderId,
      execId: str(rec.execId) ?? '',
      orderVersion: num(rec.orderVersion),
      state: str(rec.state),
    };
  }
}

/** Where a run's order and execution events come from. Tests use an in-memory source. */
export interface EventSource {
  /** Subscribes with a fresh group, at the latest offsets, and resolves once the group has joined. */
  start(groupId: string, onEvent: (ev: TrackerEvent) => void): Promise<void>;
  stop(): Promise<void>;
  readonly decodeErrors: number;
}

export interface KafkaOptions {
  brokers: string[];
  registryUrl: string;
  topics: Topics;
  joinTimeoutMs?: number;
  log?: Logger;
}

/** The kafkajs consumer of oms_orders and oms_order_executions (design D3). */
export class KafkaEventSource implements EventSource {
  private consumer: Consumer | null = null;
  private readonly decoder: RecordDecoder;
  private readonly kafka: Kafka;

  constructor(private readonly o: KafkaOptions) {
    this.kafka = new Kafka({ clientId: 'mission-control', brokers: o.brokers, logLevel: logLevel.WARN, retry: { retries: 2 } });
    this.decoder = new RecordDecoder(o.registryUrl, o.topics, o.log);
  }

  get decodeErrors(): number {
    return this.decoder.decodeErrors;
  }

  async start(groupId: string, onEvent: (ev: TrackerEvent) => void): Promise<void> {
    const consumer = this.kafka.consumer({ groupId, sessionTimeout: 10_000, heartbeatInterval: 1000 });
    this.consumer = consumer;
    const joined = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`consumer group ${groupId} did not join within ${this.o.joinTimeoutMs ?? 10_000} ms`)), this.o.joinTimeoutMs ?? 10_000);
      consumer.on(consumer.events.GROUP_JOIN, () => {
        clearTimeout(timer);
        resolve();
      });
    });
    await consumer.connect();
    await consumer.subscribe({ topics: [this.o.topics.orders, this.o.topics.executions], fromBeginning: false });
    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        const ev = await this.decoder.decode(topic, message.value);
        if (ev) onEvent(ev);
      },
    });
    await joined;
  }

  async stop(): Promise<void> {
    await this.consumer?.disconnect();
    this.consumer = null;
  }
}

/** Preflight: can the brokers be reached? */
export async function checkKafka(brokers: string[], timeoutMs = 3000): Promise<string | null> {
  const admin = new Kafka({ clientId: 'mission-control-preflight', brokers, logLevel: logLevel.NOTHING, connectionTimeout: timeoutMs, retry: { retries: 0 } }).admin();
  try {
    await withTimeout(admin.connect(), timeoutMs);
    await withTimeout(admin.describeCluster(), timeoutMs);
    return null;
  } catch (e) {
    return (e as Error).message;
  } finally {
    await admin.disconnect().catch(() => {});
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout after ${ms} ms`)), ms))]);
}
