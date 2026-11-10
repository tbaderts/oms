// gridSizing.ts - How both blotters size their columns (SPEC-0058).
import { GridSizeChangedEvent, SizeColumnsToFitGridStrategy } from 'ag-grid-community';

/**
 * Columns fill the grid's width (SPEC-0058): sized to the panel when the grid starts, not to the
 * headers of a grid with no rows yet. One object, so AG Grid sees no change on a re-render.
 */
export const FIT_COLUMNS_TO_WIDTH: SizeColumnsToFitGridStrategy = { type: 'fitGridWidth', defaultMinWidth: 110 };

/**
 * Keeps the columns filling the panel when the grid changes size (the window) or gets a new column
 * set (the Columns selector). A column the user resized by hand keeps its width until then.
 */
export const fitColumnsOnResize = (event: Pick<GridSizeChangedEvent, 'api'>) => event.api.sizeColumnsToFit();
