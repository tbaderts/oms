// filterUtils.test.ts - Tests for shared filter conversion helpers
import { convertFiltersToState, convertFiltersFromState } from './filterUtils';

describe('filterUtils', () => {
  describe('convertFiltersToState', () => {
    it('converts filter conditions to a flat key/value map', () => {
      const filters = [
        { field: 'symbol', operation: '__like', value: '%BTC%' },
        { field: 'side', operation: '', value: 'BUY' },
      ];

      const state = convertFiltersToState(filters);

      expect(state).toEqual({
        symbol__like: '%BTC%',
        side: 'BUY',
      });
    });

    it('returns an empty object for no filters', () => {
      expect(convertFiltersToState([])).toEqual({});
    });
  });

  describe('convertFiltersFromState', () => {
    it('parses keys with operation suffixes back into conditions', () => {
      const state = {
        symbol__like: '%BTC%',
        side: 'BUY',
      };

      const filters = convertFiltersFromState(state);

      expect(filters).toContainEqual({
        field: 'symbol',
        operation: '__like',
        value: '%BTC%',
      });
      expect(filters).toContainEqual({
        field: 'side',
        operation: '',
        value: 'BUY',
      });
    });

    it('round-trips through convertFiltersToState', () => {
      const original = [
        { field: 'price', operation: '__gte', value: '100' },
        { field: 'orderQty', operation: '__between', value: '1,10' },
      ];

      const roundTripped = convertFiltersFromState(convertFiltersToState(original));

      expect(roundTripped).toEqual(original);
    });

    it('returns an empty array for empty state', () => {
      expect(convertFiltersFromState({})).toEqual([]);
    });
  });
});
