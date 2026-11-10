// RSocketStreamingService.test.ts - Tests for UI-to-stream filter conversion
import { Buffer } from 'buffer';
import { RSocketStreamingService, STREAM_BATCH } from './RSocketStreamingService';
import { FilterCondition } from '../types/types';

describe('RSocketStreamingService.convertToStreamFilter', () => {
  let service: RSocketStreamingService;

  beforeEach(() => {
    (RSocketStreamingService as any).instance = null;
    service = RSocketStreamingService.getInstance();
  });

  it('converts UI filter operations to streaming operators', () => {
    const uiFilters: FilterCondition[] = [
      { field: 'symbol', operation: '', value: 'BTCUSD' },
      { field: 'orderQty', operation: '__gte', value: 10 },
      { field: 'price', operation: '__between', value: 100, value2: 200 },
    ];

    const streamFilter = service.convertToStreamFilter(uiFilters, true);

    expect(streamFilter.logicalOperator).toBe('AND');
    expect(streamFilter.includeSnapshot).toBe(true);
    expect(streamFilter.filters).toEqual([
      { field: 'symbol', operator: 'EQ', value: 'BTCUSD' },
      { field: 'orderQty', operator: 'GTE', value: '10' },
      { field: 'price', operator: 'BETWEEN', value: '100', value2: '200' },
    ]);
  });

  it('strips wrapping % wildcards from LIKE values', () => {
    const uiFilters: FilterCondition[] = [
      { field: 'symbol', operation: '__like', value: '%BTC%' },
    ];

    const streamFilter = service.convertToStreamFilter(uiFilters, false);

    expect(streamFilter.filters[0]).toEqual({
      field: 'symbol',
      operator: 'LIKE',
      value: 'BTC',
    });
    expect(streamFilter.includeSnapshot).toBe(false);
  });

  it('drops filters with empty field or value', () => {
    const uiFilters: FilterCondition[] = [
      { field: '', operation: '', value: 'x' },
      { field: 'symbol', operation: '', value: '' },
      { field: 'side', operation: '', value: 'BUY' },
    ];

    const streamFilter = service.convertToStreamFilter(uiFilters, true);

    expect(streamFilter.filters).toHaveLength(1);
    expect(streamFilter.filters[0].field).toBe('side');
  });

  it('returns an empty filter list for no UI filters', () => {
    const streamFilter = service.convertToStreamFilter([], true);

    expect(streamFilter.filters).toEqual([]);
    expect(streamFilter.includeSnapshot).toBe(true);
  });
});

describe('RSocketStreamingService.normalizeOrderEvent', () => {
  it('maps streaming order fields to grid-expected fields', () => {
    const event = {
      eventType: 'UPDATE',
      orderId: 'O-1',
      eventId: 5,
      sequenceNumber: 10,
      timestamp: '2026-08-21T00:00:00Z',
      order: {
        orderId: 'O-1',
        symbol: 'BTCUSD',
        state: 'LIVE',
      },
    } as any;

    const normalized = RSocketStreamingService.normalizeOrderEvent(event);

    expect(normalized.id).toBe('O-1');
    expect(normalized.ordStatus).toBe('LIVE');
    expect(normalized.symbol).toBe('BTCUSD');
  });
});

// SPEC-0057 AC-6: the client asks for events in bounded batches and asks for more only as it has
// processed them, so a slow blotter applies back-pressure instead of buffering without limit.
describe('RSocketStreamingService stream demand (SPEC-0057)', () => {
  let service: RSocketStreamingService;
  let requests: number[];
  let subscriber: any;
  let sentPayload: any;

  beforeEach(() => {
    (RSocketStreamingService as any).instance = null;
    service = RSocketStreamingService.getInstance();
    requests = [];
    subscriber = null;
    (service as any).socket = {
      requestStream: (payload: any) => {
        sentPayload = JSON.parse(payload.data.toString());
        return {
          subscribe: (s: any) => {
            subscriber = s;
            s.onSubscribe({ request: (n: number) => requests.push(n), cancel: () => undefined });
          },
        };
      },
    };
  });

  const deliver = (count: number, event: object) => {
    for (let i = 0; i < count; i++) {
      subscriber.onNext({ data: Buffer.from(JSON.stringify(event)) });
    }
  };

  it.each([
    ['orders', (cb: any) => service.subscribeToOrders(service.convertToStreamFilter([], true, 2000), cb), { eventType: 'UPDATE', orderId: 'O-1' }],
    ['executions', (cb: any) => service.subscribeToExecutions(service.convertToStreamFilter([], true, 2000), cb), { eventType: 'NEW', orderId: 'O-1', execId: 'E-1' }],
  ])('requests %s in bounded batches', (_name, subscribe: any, event) => {
    let processed = 0;
    subscribe({ onNext: () => { processed++; }, onError: () => undefined, onComplete: () => undefined });

    expect(requests).toEqual([STREAM_BATCH]);
    deliver(STREAM_BATCH / 2 - 1, event);
    expect(requests).toEqual([STREAM_BATCH]);
    deliver(1, event);
    expect(requests).toEqual([STREAM_BATCH, STREAM_BATCH / 2]);
    deliver(STREAM_BATCH / 2, event);
    expect(requests).toEqual([STREAM_BATCH, STREAM_BATCH / 2, STREAM_BATCH / 2]);
    expect(processed).toBe(STREAM_BATCH);
    expect(Math.max(...requests)).toBeLessThan(2147483647);
    // Never more than one batch outstanding: requested minus processed stays within it.
    expect(requests.reduce((a, b) => a + b, 0) - processed).toBeLessThanOrEqual(STREAM_BATCH);
  });

  it('sends the snapshot limit with the filter', () => {
    service.subscribeToOrders(service.convertToStreamFilter([], true, 2000), {
      onNext: () => undefined, onError: () => undefined, onComplete: () => undefined,
    });

    expect(sentPayload).toEqual({ logicalOperator: 'AND', filters: [], includeSnapshot: true, snapshotLimit: 2000 });
  });

  it('sends no snapshot limit when none is given', () => {
    expect(service.convertToStreamFilter([], true)).not.toHaveProperty('snapshotLimit');
  });
});
