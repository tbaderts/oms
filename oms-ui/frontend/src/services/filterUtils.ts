// filterUtils.ts - Shared filter conversion helpers used by both the REST
// Blotter and the StreamingBlotter so state round-trips identically.
import { FilterCondition } from '../types/types';

/**
 * Convert a list of filter conditions to the flat key/value map persisted in
 * BlotterStateSnapshot. Keys are `field + operation` (e.g. `symbol__like`).
 */
export function convertFiltersToState(filters: FilterCondition[]): { [key: string]: any } {
  const state: { [key: string]: any } = {};
  filters.forEach(f => {
    state[`${f.field}${f.operation}`] = f.value;
  });
  return state;
}

/**
 * Reverse of convertFiltersToState: parse a persisted state map back into
 * filter conditions. The optional `__op` suffix is split off the key.
 */
export function convertFiltersFromState(state: { [key: string]: any }): FilterCondition[] {
  return Object.entries(state).map(([key, value]) => {
    const match = key.match(/^(.+?)(__\w+)?$/);
    return {
      field: match![1],
      operation: match![2] || '',
      value,
    };
  });
}
