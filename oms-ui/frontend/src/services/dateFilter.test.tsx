// dateFilter.test.tsx - AG Grid's date filter picks calendar days in the browser's time zone, the
// zone the blotters display times in; the backend compares ISO-8601 instants. These tests hold the
// two to the same meaning: the server query and the grid's own filtering match the same rows.
import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { AgGridReact } from 'ag-grid-react';
import { GridApi } from 'ag-grid-community';
import { DATE_FILTER_PARAMS, dateFilterToConditions, localDayComparator } from './dateFilter';
import { OMS_GRID_MODULES } from '../theme/gridModules';

jest.mock('../theme/agGridTheme', () => ({ omsGridTheme: 'legacy' }));

/** Local midnight of a calendar day, as the instant the backend receives. Zone-independent tests. */
const startOf = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();
/** An instant at a local wall-clock time. */
const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).toISOString();

describe('dateFilterToConditions', () => {
  it('equals a day: from its local midnight up to, not including, the next one ("today")', () => {
    expect(dateFilterToConditions('transactTime', { filterType: 'date', type: 'equals', dateFrom: '2026-11-25 00:00:00' }))
      .toEqual([
        { field: 'transactTime', operation: '__gte', value: startOf(2026, 11, 25) },
        { field: 'transactTime', operation: '__lt', value: startOf(2026, 11, 26) },
      ]);
  });

  it('before a day: earlier than its start', () => {
    expect(dateFilterToConditions('sendingTime', { filterType: 'date', type: 'lessThan', dateFrom: '2026-11-25 00:00:00' }))
      .toEqual([{ field: 'sendingTime', operation: '__lt', value: startOf(2026, 11, 25) }]);
  });

  it('after a day: from the start of the next', () => {
    expect(dateFilterToConditions('transactTime', { filterType: 'date', type: 'greaterThan', dateFrom: '2026-11-25 00:00:00' }))
      .toEqual([{ field: 'transactTime', operation: '__gte', value: startOf(2026, 11, 26) }]);
  });

  it('between two days, both included', () => {
    expect(dateFilterToConditions('transactTime', {
      filterType: 'date', type: 'inRange', dateFrom: '2026-11-20 00:00:00', dateTo: '2026-11-25 00:00:00',
    })).toEqual([
      { field: 'transactTime', operation: '__gte', value: startOf(2026, 11, 20) },
      { field: 'transactTime', operation: '__lt', value: startOf(2026, 11, 26) },
    ]);
  });

  it('crosses month and year ends', () => {
    expect(dateFilterToConditions('transactTime', { filterType: 'date', type: 'equals', dateFrom: '2026-12-31 00:00:00' })[1])
      .toEqual({ field: 'transactTime', operation: '__lt', value: startOf(2027, 1, 1) });
  });

  it('sends nothing for a filter it cannot express rather than a wrong one', () => {
    expect(dateFilterToConditions('transactTime', { filterType: 'date', type: 'equals', dateFrom: null })).toEqual([]);
    expect(dateFilterToConditions('transactTime', { filterType: 'date', type: 'notEqual', dateFrom: '2026-11-25 00:00:00' })).toEqual([]);
  });
});

describe('localDayComparator', () => {
  const filterDay = new Date(2026, 10, 25);

  it('compares the cell by its local calendar day', () => {
    expect(localDayComparator(filterDay, at(2026, 11, 25, 0, 0))).toBe(0);
    expect(localDayComparator(filterDay, at(2026, 11, 25, 23, 59))).toBe(0);
    expect(localDayComparator(filterDay, at(2026, 11, 24, 23, 59))).toBeLessThan(0);
    expect(localDayComparator(filterDay, at(2026, 11, 26, 0, 0))).toBeGreaterThan(0);
  });

  it('treats a missing or unreadable time as not matching', () => {
    expect(localDayComparator(filterDay, null)).not.toBe(0);
    expect(localDayComparator(filterDay, 'not a date')).not.toBe(0);
  });
});

describe('the grid filters its own rows the way the server does', () => {
  const rows = [
    { id: 'yesterday-late', transactTime: at(2026, 11, 24, 23, 30) },
    { id: 'today-early', transactTime: at(2026, 11, 25, 0, 15) },
    { id: 'today-late', transactTime: at(2026, 11, 25, 23, 45) },
    { id: 'tomorrow', transactTime: at(2026, 11, 26, 9, 0) },
  ];

  const renderGrid = async () => {
    let api: GridApi | null = null;
    render(
      <div style={{ width: 600, height: 300 }}>
        <AgGridReact
          modules={OMS_GRID_MODULES}
          theme="legacy"
          rowData={rows}
          getRowId={(p) => p.data.id}
          columnDefs={[{ field: 'id' }, { field: 'transactTime', filter: 'agDateColumnFilter', filterParams: DATE_FILTER_PARAMS }]}
          onGridReady={(e) => { api = e.api; }}
        />
      </div>,
    );
    await waitFor(() => expect(api).not.toBeNull());
    return api!;
  };

  const shown = (api: GridApi) => {
    const ids: string[] = [];
    api.forEachNodeAfterFilter((node) => ids.push(node.data.id));
    return ids;
  };

  /** What the server returns for the conditions the blotter sends: the same predicate on instants. */
  const serverMatches = (model: any) => rows.filter((row) => dateFilterToConditions('transactTime', model).every((c) => (
    c.operation === '__gte' ? row.transactTime >= c.value : row.transactTime < c.value
  ))).map((row) => row.id);

  it.each([
    ['equals', { filterType: 'date', type: 'equals', dateFrom: '2026-11-25 00:00:00' }, ['today-early', 'today-late']],
    ['lessThan', { filterType: 'date', type: 'lessThan', dateFrom: '2026-11-25 00:00:00' }, ['yesterday-late']],
    ['greaterThan', { filterType: 'date', type: 'greaterThan', dateFrom: '2026-11-25 00:00:00' }, ['tomorrow']],
    ['inRange', { filterType: 'date', type: 'inRange', dateFrom: '2026-11-24 00:00:00', dateTo: '2026-11-25 00:00:00' },
      ['yesterday-late', 'today-early', 'today-late']],
  ])('%s', async (_name, model, expected) => {
    const api = await renderGrid();

    await act(async () => { await api.setColumnFilterModel('transactTime', model); api.onFilterChanged(); });

    expect(shown(api)).toEqual(expected);
    expect(serverMatches(model)).toEqual(expected);
  });

  it('offers only the operators the server can answer, one condition at a time', () => {
    expect(DATE_FILTER_PARAMS.filterOptions).toEqual(['equals', 'lessThan', 'greaterThan', 'inRange']);
    expect(DATE_FILTER_PARAMS.maxNumConditions).toBe(1);
    expect(DATE_FILTER_PARAMS.inRangeInclusive).toBe(true);
  });
});
