// newestFirst.test.tsx - The live blotters list the newest transactTime on top, for orders and
// executions, including rows added later by transaction. Runs a real grid with the blotters' modules.
import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, GridApi } from 'ag-grid-community';
import { OMS_GRID_MODULES } from './gridModules';
import { LIVE_DEFAULT_COL_DEF, sortNewestFirst } from './gridOptions';

jest.mock('./agGridTheme', () => ({ omsGridTheme: 'legacy' }));

const renderGrid = async (columnDefs: ColDef[], rows: any[]) => {
  let api: GridApi | null = null;
  render(
    <div style={{ width: 800, height: 400 }}>
      <AgGridReact
        modules={OMS_GRID_MODULES}
        theme="legacy"
        rowData={rows}
        columnDefs={columnDefs}
        defaultColDef={LIVE_DEFAULT_COL_DEF}
        getRowId={(p) => p.data.id}
        onGridReady={(e) => { api = e.api; }}
      />
    </div>,
  );
  await waitFor(() => expect(api).not.toBeNull());
  return api!;
};

const displayedIds = (api: GridApi) => {
  const ids: string[] = [];
  api.forEachNodeAfterFilterAndSort((node) => ids.push(node.data.id));
  return ids;
};

const row = (id: string, transactTime: string) => ({ id, symbol: 'AAPL', transactTime });

describe('sortNewestFirst', () => {
  it('sorts by transactTime, newest on top, also for rows added later', async () => {
    const columns = sortNewestFirst([{ field: 'id' }, { field: 'transactTime' }]);
    const api = await renderGrid(columns, [
      row('A', '2026-11-25T09:00:00Z'), row('B', '2026-11-25T11:00:00Z'), row('C', '2026-11-25T10:00:00Z'),
    ]);

    expect(displayedIds(api)).toEqual(['B', 'C', 'A']);

    act(() => { api.applyTransaction({ add: [row('D', '2026-11-25T12:00:00Z')] }); });
    expect(displayedIds(api)[0]).toBe('D');
    // An update that moves a row's time moves the row.
    act(() => { api.applyTransaction({ update: [row('A', '2026-11-25T13:00:00Z')] }); });
    expect(displayedIds(api)).toEqual(['A', 'D', 'B', 'C']);
  });

  it('compares instants, not strings, so fractional seconds sort correctly', async () => {
    const columns = sortNewestFirst([{ field: 'id' }, { field: 'transactTime' }]);
    const api = await renderGrid(columns, [
      row('whole', '2026-11-25T10:00:00Z'), row('later', '2026-11-25T10:00:00.5Z'), row('none', undefined as any),
    ]);

    expect(displayedIds(api)).toEqual(['later', 'whole', 'none']);
  });

  it('sorts by transactTime through a hidden column when it is not shown', async () => {
    const columns = sortNewestFirst([{ field: 'id' }, { field: 'symbol' }]);
    const api = await renderGrid(columns, [row('A', '2026-11-25T09:00:00Z'), row('B', '2026-11-25T11:00:00Z')]);

    expect(displayedIds(api)).toEqual(['B', 'A']);
    expect(api.getAllDisplayedColumns().map((c) => c.getColId())).toEqual(['id', 'symbol']);
  });

  it('keeps the given column definitions unchanged', () => {
    const given: ColDef[] = [{ field: 'transactTime', headerName: 'Transact Time' }];

    const result = sortNewestFirst(given);

    expect(given[0].initialSort).toBeUndefined();
    expect(result[0]).toMatchObject({ field: 'transactTime', headerName: 'Transact Time', initialSort: 'desc' });
  });
});
