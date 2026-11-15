// gridModules.test.tsx - The AG Grid modules the blotters register are exactly the ones they need
// (SPEC-0060, AC-4 and AC-5).
//
// A missing module only shows at run time, as "AG Grid: error #200 … is not registered" logged on
// the next tick, and only with ValidationModule registered. So this test runs real grids (not the
// mock the blotter tests use) with the blotters' column definitions and options, for orders and
// executions, exercises every grid feature they use, and fails on #200. Each grid gets its modules
// through the `modules` prop; nothing is registered globally, so the global registry cannot hide a
// missing module.
//
// A new grid feature in a blotter belongs in the scenarios below, with its module in gridModules.ts.
import fs from 'fs';
import path from 'path';
import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, GridApi, Module, ValidationModule } from 'ag-grid-community';
import { OMS_GRID_MODULES } from './gridModules';
import { HISTORY_DEFAULT_COL_DEF, LIVE_DEFAULT_COL_DEF } from './gridOptions';
import { FIT_COLUMNS_TO_WIDTH, fitColumnsOnResize } from './gridSizing';
import { omsGridTheme } from './agGridTheme';
import { ColumnConfigService } from '../services/ColumnConfigService';
import { rowIdOf } from '../services/rowId';
import { DomainObjectType } from '../types/types';

// One field of every kind the column definitions handle, for both blotter entities: ids, text, the
// FIX execType, enums, prices, quantities, dates, booleans and objects. The primary key is pinned.
const field = (name: string, type: string, extra: object = {}) =>
  ({ name, displayName: name, type, required: false, width: 150, ...extra });
const enumField = (name: string, ...values: string[]) =>
  field(name, 'enum', { enumValues: values.map(value => ({ value, label: value })) });

const mockMetamodels: Record<string, { primaryKey: string; fields: { name: string }[] }> = {
  Order: {
    primaryKey: 'orderId',
    fields: [
      field('orderId', 'string'), field('clOrdId', 'string'), field('symbol', 'string'),
      enumField('side', 'BUY', 'SELL'), enumField('ordType', 'LIMIT', 'MARKET'), enumField('state', 'LIVE', 'FILLED'),
      field('price', 'number'), field('orderQty', 'number'), field('cumQty', 'number'),
      field('transactTime', 'date'), field('parties', 'object'), field('manual', 'boolean'),
    ],
  },
  Execution: {
    primaryKey: 'execId',
    fields: [
      field('execId', 'string'), field('orderId', 'string'), field('symbol', 'string'), field('execType', 'string'),
      enumField('side', 'BUY', 'SELL'), field('lastPx', 'number'), field('lastQty', 'number'),
      field('transactTime', 'date'), field('manual', 'boolean'),
    ],
  },
};

jest.mock('../services/MetamodelService', () => ({
  MetamodelService: {
    getInstance: () => ({
      getMetamodel: (domainObject: string) => {
        const metamodel = mockMetamodels[domainObject];
        return { name: domainObject, displayName: domainObject, ...metamodel, defaultColumns: metamodel.fields.map(f => f.name) };
      },
    }),
  },
}));

/** One blotter entity: its rows, the columns the checks use, and what filter and sort must show. */
interface Entity {
  name: DomainObjectType;
  /** Two AAPL rows and one MSFT row: the AAPL filter keeps two, the quantity sort puts the bigger first. */
  rows: Record<string, unknown>[];
  quantity: string;
  price: string;
  filteredAndSorted: string[];
}

const common = { symbol: 'AAPL', side: 'BUY', transactTime: '2026-11-15T09:30:00Z', manual: false };
const order = (orderId: string, orderQty: number, symbol = 'AAPL') => ({
  ...common, symbol, orderId, clOrdId: `C-${orderId}`, ordType: 'LIMIT', state: 'LIVE', price: 170.5, orderQty,
  cumQty: 0, parties: [{ id: 'P1' }],
});
const execution = (execId: string, lastQty: number, symbol = 'AAPL') => ({
  ...common, symbol, execId, orderId: 'ORD-1', execType: 'F', lastPx: 170.5, lastQty,
});

const ENTITIES: Entity[] = [
  {
    name: 'Order',
    rows: [order('O-1', 100), order('O-2', 200, 'MSFT'), order('O-3', 300)],
    quantity: 'orderQty',
    price: 'price',
    filteredAndSorted: ['O-3', 'O-1'],
  },
  {
    name: 'Execution',
    rows: [execution('E-1', 100), execution('E-2', 200, 'MSFT'), execution('E-3', 300)],
    quantity: 'lastQty',
    price: 'lastPx',
    filteredAndSorted: ['ORD-1|E-3', 'ORD-1|E-1'],
  },
];

/** The ids of the rows the grid shows, top to bottom. */
function shownRowIds(container: HTMLElement): string[] {
  // A row appears once per container (the pinned id column has its own), so ids are deduplicated.
  const byIndex = new Map<number, string>();
  container.querySelectorAll('.ag-row[row-id]').forEach(el => {
    byIndex.set(Number(el.getAttribute('row-index')), el.getAttribute('row-id') ?? '');
  });
  return Array.from(byIndex.entries()).sort(([a], [b]) => a - b).map(([, id]) => id);
}

const tick = () => act(() => new Promise<void>(resolve => setTimeout(resolve, 0)));

type Scenario = 'history' | 'live';

interface Outcome {
  /** #200 errors, logged or thrown, and features that did nothing: a module is missing. */
  missing: string[];
  /** Anything else that went wrong, which would leave the run proving nothing. */
  failures: string[];
}

/** Runs one blotter's grid for `entity` on `modules` and exercises every grid feature it uses. */
async function runGrid(modules: Module[], scenario: Scenario, entity: Entity): Promise<Outcome> {
  const logged: string[] = [];
  const missing: string[] = [];
  const failures: string[] = [];
  const spy = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    logged.push(args.map(String).join(' '));
  });
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  let api: GridApi | undefined;
  const columnDefs: ColDef[] = ColumnConfigService.getInstance().getAllColumnConfig(entity.name);
  const live = scenario === 'live';

  const { container, unmount } = render(
    <div style={{ width: 1200, height: 400 }}>
      <AgGridReact
        modules={[...modules, ValidationModule]}
        theme={omsGridTheme}
        rowData={live ? [] : entity.rows}
        columnDefs={columnDefs}
        getRowId={params => rowIdOf(entity.name, params.data)}
        defaultColDef={live ? LIVE_DEFAULT_COL_DEF : HISTORY_DEFAULT_COL_DEF}
        autoSizeStrategy={FIT_COLUMNS_TO_WIDTH}
        onGridSizeChanged={fitColumnsOnResize}
        onNewColumnsLoaded={fitColumnsOnResize}
        pagination={false}
        animateRows={live ? false : undefined}
        onGridReady={event => { api = event.api; }}
        onFilterChanged={event => event.api.getFilterModel()}
        onSortChanged={event => event.api.getColumnState()}
        onRowDoubleClicked={() => undefined}
        onCellKeyDown={() => undefined}
      />
    </div>,
  );
  try {
    await waitFor(() => expect(api).toBeDefined());
    const grid = api!;
    await tick();
    if (live) {
      // The live blotter's frames: rows arrive and change by transaction; a changed cell flashes.
      act(() => { grid.applyTransaction({ add: entity.rows }); });
      await tick();
      act(() => { grid.applyTransaction({ update: [{ ...entity.rows[0], [entity.quantity]: 150 }] }); });
      await tick();
    }
    // A missing module could also fail silently, with a filter or sort that does nothing, so the
    // grid's behaviour is checked as well and counted as a missing module.
    act(() => { grid.setFilterModel({ symbol: { filterType: 'text', type: 'contains', filter: 'AA' } }); });
    await tick();
    act(() => { grid.applyColumnState({ state: [{ colId: entity.quantity, sort: 'desc' }] }); });
    await tick();
    // History animates rows, so a filtered-out row stays in the page until its animation ends.
    try {
      await waitFor(() => expect(shownRowIds(container)).toEqual(entity.filteredAndSorted), { timeout: 2000 });
    } catch {
      missing.push(`filter and sort not applied, rows shown ${shownRowIds(container).join()}`);
    }
    act(() => { grid.applyColumnState({ defaultState: { sort: null } }); });
    // Column filters of each kind, as the user sets them in the column menus.
    act(() => {
      grid.setFilterModel({
        symbol: { filterType: 'text', type: 'contains', filter: 'AA' },
        [entity.price]: { filterType: 'number', type: 'greaterThan', filter: 100 },
        transactTime: { filterType: 'date', type: 'greaterThan', dateFrom: '2026-01-01' },
        manual: { filterType: 'text', type: 'equals', filter: 'No' },
      });
    });
    await tick();
    grid.getFilterModel();
    // A header click's sort, read back as column state.
    act(() => { grid.applyColumnState({ state: [{ colId: 'transactTime', sort: 'desc' }] }); });
    await tick();
    grid.getColumnState();
    // The toolbar's Auto-Size and the fit on resize.
    act(() => { grid.autoSizeAllColumns(); grid.sizeColumnsToFit(); });
    await tick();
  } catch (error) {
    // Some calls throw #200 instead of logging it; any other error means the run proved nothing.
    (String(error).includes('#200') ? missing : failures).push(String(error));
  } finally {
    unmount();
    await tick();
    spy.mockRestore();
    warn.mockRestore();
  }
  return { missing: [...logged.filter(message => message.includes('#200')), ...missing], failures };
}

describe('AG Grid modules (SPEC-0060)', () => {
  // AC-4
  it('registers named modules, not AllCommunityModule', () => {
    const register = fs.readFileSync(path.join(__dirname, 'agGridModules.ts'), 'utf8');
    expect(register).not.toMatch(/AllCommunityModule/);
    expect(register).toMatch(/OMS_GRID_MODULES/);
    expect(OMS_GRID_MODULES.length).toBeGreaterThan(0);
    expect(OMS_GRID_MODULES.map(m => m.moduleName)).not.toContain('AllCommunity');
  });

  // AC-5
  for (const entity of ENTITIES) {
    it(`the history configuration needs no other module (${entity.name})`, async () => {
      expect(await runGrid(OMS_GRID_MODULES, 'history', entity)).toEqual({ missing: [], failures: [] });
    });

    it(`the live configuration needs no other module (${entity.name})`, async () => {
      expect(await runGrid(OMS_GRID_MODULES, 'live', entity)).toEqual({ missing: [], failures: [] });
    });
  }

  // AC-5: the check bites, and the list holds no module the grids do without. The full list runs
  // clean above, so whatever goes wrong without one module is down to that module.
  it('every listed module is needed', async () => {
    const unneeded: string[] = [];
    for (const module of OMS_GRID_MODULES) {
      const rest = OMS_GRID_MODULES.filter(m => m !== module);
      let caught = false;
      for (const entity of ENTITIES) {
        for (const scenario of ['history', 'live'] as const) {
          if (!caught) {
            const outcome = await runGrid(rest, scenario, entity);
            caught = outcome.missing.length > 0 || outcome.failures.length > 0;
          }
        }
      }
      if (!caught) unneeded.push(module.moduleName);
    }
    expect(unneeded).toEqual([]);
  }, 120_000);
});
