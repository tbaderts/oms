// RSocketStreamingService.test.ts - Tests for UI-to-stream filter conversion
import { RSocketStreamingService } from './RSocketStreamingService';
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
