import { SchemaRegistry } from '@kafkajs/confluent-schema-registry';
import { RecordDecoder } from '../../src/server/kafka/EventConsumer';
import { fullRecord, stubRegistry, type StubRegistry } from '../support/stubRegistry';

const TOPICS = { orders: 'oms_orders', executions: 'oms_order_executions' };

describe('RecordDecoder (AC-2)', () => {
  let registry: StubRegistry;
  let encoder: SchemaRegistry;
  beforeAll(async () => {
    registry = await stubRegistry();
    encoder = new SchemaRegistry({ host: registry.url });
  });
  afterAll(async () => registry.close());

  it('decodes OrderMessage and OrderExecution from the wire format', async () => {
    const decoder = new RecordDecoder(registry.url, TOPICS);
    const nowUs = 1_762_600_000_000_123; // ≈ 2025-11 in µs: above 2^50, below MAX_SAFE_INTEGER

    const order = await encoder.encode(registry.ids.OrderMessage, fullRecord('OrderMessage', {
      orderId: 'O1',
      sessionId: 'mc-r1',
      clOrdId: 'r1-0',
      state: 'LIVE',
      eventId: 2,
      rejectReason: null,
      orderReceivedTime: nowUs,
      ackTime: nowUs + 2500,
      marketSendTime: nowUs + 4000,
      marketAckTime: nowUs + 16000,
    }));
    expect(order[0]).toBe(0); // Confluent magic byte
    expect(await decoder.decode('oms_orders', order)).toEqual({
      kind: 'order',
      sessionId: 'mc-r1',
      clOrdId: 'r1-0',
      orderId: 'O1',
      eventId: 2,
      state: 'LIVE',
      rejectReason: null,
      orderReceivedTime: nowUs,
      ackTime: nowUs + 2500,
      marketSendTime: nowUs + 4000,
      marketAckTime: nowUs + 16000,
    });

    const exec = await encoder.encode(registry.ids.OrderExecution, fullRecord('OrderExecution', {
      execId: 'O1-F1',
      orderId: 'O1',
      sessionId: 'mc-r1',
      clOrdId: 'r1-0',
      orderVersion: 3,
      state: 'FILLED',
    }));
    expect(await decoder.decode('oms_order_executions', exec)).toEqual({
      kind: 'execution',
      sessionId: 'mc-r1',
      clOrdId: 'r1-0',
      orderId: 'O1',
      execId: 'O1-F1',
      orderVersion: 3,
      state: 'FILLED',
    });
  });

  it('counts records that cannot be decoded and returns null', async () => {
    const decoder = new RecordDecoder(registry.url, TOPICS);
    expect(await decoder.decode('oms_orders', Buffer.from('not avro'))).toBeNull();
    expect(await decoder.decode('oms_orders', Buffer.from([0, 0, 0, 0, 99, 1, 2]))).toBeNull(); // unknown schema id
    expect(await decoder.decode('some_other_topic', Buffer.from([0]))).toBeNull();
    expect(decoder.decodeErrors).toBe(2);
  });
});
