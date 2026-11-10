import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Blotter from './Blotter';

// AG Grid is stubbed: the test reads the rows and the getRowId the blotter hands it.
let mockGridProps: any = null;
jest.mock('ag-grid-react', () => ({
  AgGridReact: (props: any) => {
    mockGridProps = props;
    return null;
  },
}));
jest.mock('../theme/agGridTheme', () => ({ omsGridTheme: {} }));

const mockExecutions = {
  content: [
    { id: 1, orderId: 'O-1', execId: 'E-1', avgPx: 10 },
    { id: 2, orderId: 'O-1', execId: 'E-2', avgPx: 10.6 },
    { id: 3, orderId: 'O-2', execId: 'E-1', avgPx: 20 },
  ],
  page: { totalElements: 3, totalPages: 1, size: 100, number: 0 },
};

// Three pages of 100 (250 total) so the Next/Last controls are enabled; the last page is partial.
const mockPagedExecutions = (page: number) => ({
  content: Array.from({ length: page === 2 ? 50 : 100 }, (_, i) => ({
    id: page * 100 + i + 1,
    orderId: `O-${page * 100 + i + 1}`,
    execId: 'E-1',
    avgPx: 10,
  })),
  page: { totalElements: 250, totalPages: 3, size: 100, number: page },
});

// Plain variables, not jest.fn: CRA's jest config resets mock implementations before each test.
let mockGetExecutionsCalls: any[][] = [];
let mockResponse: any = mockExecutions;
jest.mock('../services/OMSApiService', () => ({
  OMSApiService: {
    getInstance: async () => ({
      getExecutions: async (...args: any[]) => {
        mockGetExecutionsCalls.push(args);
        return typeof mockResponse === 'function' ? mockResponse(args[2]) : mockResponse;
      },
    }),
  },
}));
jest.mock('../services/MetamodelService', () => ({
  MetamodelService: {
    getInstance: () => ({
      getMetamodelAsync: async () => undefined,
      getMetamodel: () => ({ displayName: 'Executions', defaultColumns: ['execId'], fields: [], primaryKey: 'execId' }),
    }),
  },
}));
jest.mock('../services/ColumnConfigService', () => ({
  ColumnConfigService: {
    getInstance: () => ({
      getColumnConfig: (_domain: string, columns: string[]) => {
        mockColumnArgs.push(columns);
        return [];
      },
    }),
  },
}));
jest.mock('../services/BlotterStateService', () => ({
  BlotterStateService: {
    getInstance: () => ({
      getState: () => mockSavedState,
      // Persists like the real service: what is saved is what the next getState returns.
      saveState: (_domain: string, state: any) => { mockSaveCalls++; mockSavedState = state; },
    }),
  },
}));
let mockColumnArgs: string[][] = [];
let mockSavedState: any = null;
let mockSaveCalls = 0;
const lastColumns = () => mockColumnArgs[mockColumnArgs.length - 1];
const saved = (visibleColumns: string[]) => ({ filters: {}, visibleColumns, sortModel: [], pageSize: 100, currentPage: 1 });

// SPEC-0056: the paging blotter shares its saved columns with the live one, which is kept mounted.
describe('Blotter shared state with the live blotter (SPEC-0056)', () => {
  beforeEach(() => {
    mockColumnArgs = [];
    mockSavedState = null;
    mockSaveCalls = 0;
    mockGetExecutionsCalls = [];
    mockResponse = mockExecutions;
  });

  // AC-6: a column hidden in live mode is still shown, in its place, in paging mode.
  it('shows saved history-only columns', async () => {
    mockSavedState = saved(['execId', 'id', 'orderId', 'status']);
    render(<Blotter domainObject="Execution" />);

    await waitFor(() => expect(lastColumns()).toEqual(['execId', 'id', 'orderId', 'status']));
  });

  // SPEC-0056 (third review): the live blotter saves no paging (pageSize 0, currentPage 0); the
  // paging blotter then starts on its first page with its own page size.
  it('starts on the first page from the state the live blotter saved', async () => {
    mockSavedState = { filters: {}, visibleColumns: ['execId'], sortModel: [], pageSize: 0, currentPage: 0 };
    render(<Blotter domainObject="Execution" />);

    await waitFor(() => expect(mockGetExecutionsCalls.length).toBeGreaterThan(0));
    expect(lastCall()).toEqual({ page: 0, size: 100 });
    expect(document.querySelector('.current-page')?.textContent).toBe('1');
  });

  // SPEC-0056 (second review): the live blotter is used first; the paging blotter's first mount
  // must read the shared choice, not overwrite it with its empty initial state.
  it('does not overwrite the shared saved state when it first mounts', async () => {
    mockSavedState = { ...saved(['execId', 'id', 'status']), filters: { orderId__like: 'O-1' } };
    render(<Blotter domainObject="Execution" />);

    await waitFor(() => expect(lastColumns()).toEqual(['execId', 'id', 'status']));
    expect(mockSavedState.visibleColumns).toEqual(['execId', 'id', 'status']);
    expect(mockSavedState.filters).toEqual({ orderId__like: 'O-1' });
  });

  it('re-reads the shared saved columns when it becomes active, and saves only while active', async () => {
    mockSavedState = saved(['execId']);
    const { rerender } = render(<Blotter domainObject="Execution" active />);
    await waitFor(() => expect(lastColumns()).toEqual(['execId']));

    rerender(<Blotter domainObject="Execution" active={false} />);
    const savesWhileHidden = mockSaveCalls;
    mockSavedState = saved(['execId', 'orderId']); // the live blotter changed the shared choice
    rerender(<Blotter domainObject="Execution" active={false} />);
    expect(mockSaveCalls).toBe(savesWhileHidden);

    rerender(<Blotter domainObject="Execution" active />);
    await waitFor(() => expect(lastColumns()).toEqual(['execId', 'orderId']));
  });

  it('does not auto-refresh while hidden', async () => {
    jest.useFakeTimers();
    try {
      const { rerender } = render(<Blotter domainObject="Execution" active />);
      await waitFor(() => expect(mockGetExecutionsCalls.length).toBeGreaterThan(0));
      fireEvent.click(screen.getByLabelText('Auto-refresh'));
      const tick = async () => {
        await act(async () => {
          jest.advanceTimersByTime(31_000);
          for (let i = 0; i < 5; i++) await Promise.resolve();
        });
      };

      // Active: the refresh fires (the test can see it).
      const before = mockGetExecutionsCalls.length;
      await tick();
      expect(mockGetExecutionsCalls.length).toBeGreaterThan(before);

      // Hidden: no refresh.
      rerender(<Blotter domainObject="Execution" active={false} />);
      const calls = mockGetExecutionsCalls.length;
      await tick();
      await tick();
      expect(mockGetExecutionsCalls.length).toBe(calls);
    } finally {
      jest.useRealTimers();
    }
  });
});

/** The (page, size) pair of the most recent search call: [filters, sort, page, size]. */
const lastCall = () => {
  const args = mockGetExecutionsCalls[mockGetExecutionsCalls.length - 1];
  return { page: args[2], size: args[3] };
};

describe('Blotter executions over REST (SPEC-0041)', () => {
  beforeEach(() => {
    mockGridProps = null;
    mockGetExecutionsCalls = [];
    mockResponse = mockExecutions;
  });

  // AC-5, AC-6: two fills of one order, and one execId on two orders, are three distinct rows
  it('keys execution rows by orderId and execId', async () => {
    render(<Blotter domainObject="Execution" />);

    await waitFor(() => expect(mockGridProps?.rowData).toHaveLength(3));
    const ids = mockGridProps.rowData.map((data: any) => mockGridProps.getRowId({ data }));
    expect(new Set(ids).size).toBe(3);
    expect(ids).toEqual(['O-1|E-1', 'O-1|E-2', 'O-2|E-1']);
  });
});

describe('Blotter paging (SPEC-0054)', () => {
  beforeEach(() => {
    mockGridProps = null;
    mockSavedState = null; // the state mock persists; start each test with nothing saved
    mockGetExecutionsCalls = [];
    mockResponse = mockExecutions;
  });

  const renderBlotter = async () => {
    render(<Blotter domainObject="Execution" />);
    await waitFor(() => expect(mockGridProps).not.toBeNull());
  };

  // AC-3, AC-4
  it('fetches with page and size params', async () => {
    mockResponse = mockPagedExecutions(0);
    await renderBlotter();
    await waitFor(() => expect(mockGetExecutionsCalls).toHaveLength(1));
    expect(lastCall()).toEqual({ page: 0, size: 100 });

    fireEvent.click(screen.getByText(/Next/));
    await waitFor(() => expect(mockGetExecutionsCalls).toHaveLength(2));
    expect(lastCall()).toEqual({ page: 1, size: 100 });
  });

  // AC-4
  it('uses the selected page size', async () => {
    await renderBlotter();
    await waitFor(() => expect(mockGetExecutionsCalls).toHaveLength(1));

    fireEvent.change(screen.getByLabelText('Rows per page'), { target: { value: '250' } });

    await waitFor(() => expect(mockGetExecutionsCalls).toHaveLength(2));
    expect(lastCall()).toEqual({ page: 0, size: 250 });
  });

  // AC-4
  it('resets to the first page when the page size changes', async () => {
    mockResponse = mockPagedExecutions(0);
    await renderBlotter();
    await waitFor(() => expect(mockGetExecutionsCalls).toHaveLength(1));

    fireEvent.click(screen.getByText(/Next/));
    await waitFor(() => expect(lastCall()).toEqual({ page: 1, size: 100 }));

    fireEvent.change(screen.getByLabelText('Rows per page'), { target: { value: '500' } });

    await waitFor(() => expect(mockGetExecutionsCalls).toHaveLength(3));
    expect(lastCall()).toEqual({ page: 0, size: 500 });
  });

  // AC-5
  it('renders the partial last page', async () => {
    mockResponse = mockPagedExecutions;
    await renderBlotter();
    await waitFor(() => expect(mockGetExecutionsCalls).toHaveLength(1));

    fireEvent.click(screen.getByText(/Last/));
    await waitFor(() => expect(lastCall()).toEqual({ page: 2, size: 100 }));
    await waitFor(() => expect(mockGridProps.rowData).toHaveLength(50));
  });
});

// SPEC-0058 AC-8: columns fill the panel (fit to the grid's width), toolbar actions carry an icon.
describe('Blotter layout (SPEC-0058)', () => {
  beforeEach(() => {
    mockGridProps = null;
    mockSavedState = null;
    mockGetExecutionsCalls = [];
    mockResponse = mockExecutions;
  });

  it('fits the columns to the grid width, and keeps doing so as the grid resizes', async () => {
    render(<Blotter domainObject="Execution" />);
    await waitFor(() => expect(mockGridProps).not.toBeNull());

    expect(mockGridProps.autoSizeStrategy).toEqual({ type: 'fitGridWidth', defaultMinWidth: 110 });
    let fitted = 0;
    mockGridProps.onGridSizeChanged({ api: { sizeColumnsToFit: () => { fitted++; } } });
    mockGridProps.onNewColumnsLoaded({ api: { sizeColumnsToFit: () => { fitted++; } } });
    expect(fitted).toBe(2);
  });

  // New definitions on a render would reset the columns to their metamodel widths after the fit:
  // the paging grid ended at 1,460 of 1,818 px in the browser (SPEC-0058 AC-8).
  it('hands the grid the same column definitions on every render', async () => {
    render(<Blotter domainObject="Execution" />);
    await waitFor(() => expect(mockGetExecutionsCalls.length).toBeGreaterThan(0));
    const columnDefs = mockGridProps.columnDefs;

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(mockGetExecutionsCalls.length).toBeGreaterThan(1));

    expect(mockGridProps.columnDefs).toBe(columnDefs);
  });

  // AC-5: the blotter titles the detail modal by its object, in the singular.
  it('opens the detail modal titled by the singular object', async () => {
    render(<Blotter domainObject="Execution" />);
    await waitFor(() => expect(mockGridProps.rowData).toHaveLength(3));

    act(() => mockGridProps.onRowDoubleClicked({ data: mockExecutions.content[0] }));

    expect(document.querySelector('.detail-modal h2')?.textContent).toBe('Execution details');
  });

  it('gives each toolbar action an icon and keeps its name', async () => {
    render(<Blotter domainObject="Execution" />);
    await waitFor(() => expect(mockGridProps).not.toBeNull());

    ['Columns', 'Refresh', 'Auto-Size'].forEach(name => {
      expect(screen.getByRole('button', { name }).querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    });
    expect(screen.getByRole('button', { name: /^Filters/ }).querySelector('svg')).not.toBeNull();
  });
});

// AC-6: the public face of the project must not use emoji glyphs as UI chrome.
const EMOJI_PATTERN = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{25FB}-\u{25FE}\u{1F7E2}\u{1F7E1}\u{1F534}\u{26AA}]/u;

describe('Blotter professional chrome (SPEC-0054)', () => {
  beforeEach(() => {
    mockGridProps = null;
    mockGetExecutionsCalls = [];
    mockResponse = mockExecutions;
  });

  it('noEmojiInControls: toolbar and pagination contain no emoji glyphs', async () => {
    render(<Blotter domainObject="Execution" />);
    await waitFor(() => expect(mockGridProps).not.toBeNull());

    const container = document.querySelector('.blotter-container') as HTMLElement;
    expect(container.textContent).not.toMatch(EMOJI_PATTERN);
  });
});
