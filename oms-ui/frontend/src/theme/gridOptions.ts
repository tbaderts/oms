// gridOptions.ts - Default column definitions of the two blotters, shared so that
// theme/gridModules.test.ts runs a real grid with exactly what the blotters use (SPEC-0060).
// Module-level constants: one object for every render, so AG Grid does not re-apply column
// defaults each frame (SPEC-0057).
import { ColDef } from 'ag-grid-community';

/** History blotter (Blotter): sortable, filterable, resizable columns. */
export const HISTORY_DEFAULT_COL_DEF: ColDef = { sortable: true, filter: true, resizable: true };

/** Live blotter (StreamingBlotter): as History, and a changed cell flashes. */
export const LIVE_DEFAULT_COL_DEF: ColDef = { ...HISTORY_DEFAULT_COL_DEF, enableCellChangeFlash: true };
