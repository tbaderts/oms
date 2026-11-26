// gridOptions.ts - Default column definitions of the two blotters, shared so that
// theme/gridModules.test.ts runs a real grid with exactly what the blotters use (SPEC-0060).
// Module-level constants: one object for every render, so AG Grid does not re-apply column
// defaults each frame (SPEC-0057).
import { ColDef } from 'ag-grid-community';

/** History blotter (Blotter): sortable, filterable, resizable columns. */
export const HISTORY_DEFAULT_COL_DEF: ColDef = { sortable: true, filter: true, resizable: true };

/** Live blotter (StreamingBlotter): as History, and a changed cell flashes. */
export const LIVE_DEFAULT_COL_DEF: ColDef = { ...HISTORY_DEFAULT_COL_DEF, enableCellChangeFlash: true };

/** The field the live blotters sort on by default, newest first: orders and executions both carry it. */
export const NEWEST_FIRST_FIELD = 'transactTime';

/** Compares ISO-8601 instants by time, not text ("…00Z" vs "…00.5Z"); rows without one sort last. */
const compareInstants = (a: unknown, b: unknown): number => {
  const ta = typeof a === 'string' ? Date.parse(a) : NaN;
  const tb = typeof b === 'string' ? Date.parse(b) : NaN;
  if (Number.isNaN(ta) || Number.isNaN(tb)) {
    // With sort desc, AG Grid reverses this: a missing time ranks lowest, so it lands at the bottom.
    return Number.isNaN(ta) === Number.isNaN(tb) ? 0 : Number.isNaN(ta) ? -1 : 1;
  }
  return ta - tb;
};

/**
 * The live blotters' default sort: transactTime, newest on top. Applied as initialSort, so a sort the
 * user picks by clicking a header stays. When the column is not shown, a hidden one carries the sort;
 * hidden columns still sort in AG Grid. Returns new definitions; the given ones are not changed.
 */
export function sortNewestFirst(columnDefs: ColDef[]): ColDef[] {
  const sortBy = { initialSort: 'desc' as const, comparator: compareInstants };
  const shown = columnDefs.some(col => col.field === NEWEST_FIRST_FIELD);
  return shown
    ? columnDefs.map(col => (col.field === NEWEST_FIRST_FIELD ? { ...col, ...sortBy } : col))
    : [...columnDefs, { field: NEWEST_FIRST_FIELD, hide: true, ...sortBy }];
}
