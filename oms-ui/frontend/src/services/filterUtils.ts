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
 * Whether the filters equal the saved ones, compared in the saved form (SPEC-0056). Comparing there
 * ignores what the saved form does not keep (a BETWEEN upper bound, key order), so a blotter shown
 * again does not mistake its own filters for a change and reload its snapshot.
 */
export function sameSavedFilters(filters: FilterCondition[], saved: { [key: string]: any } | undefined): boolean {
  const current = convertFiltersToState(filters);
  const other = saved || {};
  const keys = Object.keys(current);
  return keys.length === Object.keys(other).length
    && keys.every(key => key in other && JSON.stringify(current[key]) === JSON.stringify(other[key]));
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
