// gridModules.ts - The AG Grid Community modules the blotters use (SPEC-0060), instead of
// AllCommunityModule. No side effect: theme/agGridModules.ts registers them, and
// theme/gridModules.test.tsx runs real grids on exactly this list and fails on AG Grid error #200.
// Every module here is needed: leaving any one out makes that test fail. The client-side row model
// (rowData, getRowId, filtering and sorting) is not listed because AG Grid's core always includes it.
import {
  CellStyleModule,
  ClientSideRowModelApiModule,
  ColumnApiModule,
  ColumnAutoSizeModule,
  DateFilterModule,
  HighlightChangesModule,
  Module,
  NumberFilterModule,
  TextFilterModule,
} from 'ag-grid-community';

export const OMS_GRID_MODULES: Module[] = [
  ClientSideRowModelApiModule, // applyTransaction (live blotter, SPEC-0057)
  CellStyleModule, // cellClass: the rightAligned column type (number columns, SPEC-0059)
  ColumnApiModule, // getColumnState / applyColumnState (sort)
  ColumnAutoSizeModule, // autoSizeStrategy, sizeColumnsToFit, Auto-Size
  HighlightChangesModule, // enableCellChangeFlash (live blotter)
  TextFilterModule, // text, enum, id and Yes/No columns
  NumberFilterModule, // number columns
  DateFilterModule, // date columns
];
