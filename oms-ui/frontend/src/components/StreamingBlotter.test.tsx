import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import StreamingBlotter from './StreamingBlotter';

// AG Grid is stubbed by a fake grid that applies the blotter's transactions (SPEC-0057), keyed with
// the getRowId the blotter hands it; the test reads the rows it holds.
let mockGridProps: any = null;
let mockAutoSizeCalls = 0;
// How often the fake grid rendered: the blotter's per-frame counter renders must not reach it.
let mockGridRenders = 0;
let mockGrid: { rows: Map<string, any>; transactions: any[]; api: any } | null = null;
const mockCreateGrid = (getRowId: (params: any) => string) => {
  const rows = new Map<string, any>();
  const transactions: any[] = [];
  const api = {
    applyTransaction: (t: any) => {
      transactions.push(t);
      (t.remove || []).forEach((data: any) => rows.delete(getRowId({ data })));
      (t.update || []).forEach((data: any) => rows.set(getRowId({ data }), data));
      (t.add || []).forEach((data: any) => rows.set(getRowId({ data }), data));
      return {};
    },
    autoSizeAllColumns: () => { mockAutoSizeCalls++; },
    getRowNode: () => undefined,
    flashCells: () => undefined,
  };
  return { rows, transactions, api };
};
jest.mock('ag-grid-react', () => {
  const mockReact = require('react');
  return {
    AgGridReact: (props: any) => {
      mockGridProps = props;
      mockGridRenders++;
      mockReact.useEffect(() => {
        mockGrid = mockCreateGrid(props.getRowId);
        props.onGridReady?.({ api: mockGrid.api });
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return null;
    },
  };
});
/** The rows the fake grid holds, in the order it received them. */
const gridRows = () => Array.from(mockGrid?.rows.values() ?? []);

// Frames: by default each scheduled frame runs on the next tick; a test can hold them and run them
// itself to see what one frame does (SPEC-0057).
let mockManualFrames = false;
let mockFrames: Array<() => void> = [];
jest.mock('../services/frameScheduler', () => ({
  scheduleFrame: (callback: () => void) => {
    if (mockManualFrames) {
      mockFrames.push(callback);
    } else {
      setTimeout(callback, 0);
    }
  },
}));
const runFrames = () => {
  const frames = mockFrames;
  mockFrames = [];
  frames.forEach(frame => frame());
};
jest.mock('../theme/agGridTheme', () => ({ omsGridTheme: {} }));

// Plain functions, not jest.fn: CRA's jest config resets mock implementations before each test.
let mockExecutionCallbacks: any = null;
let mockStateListener: ((state: string) => void) | null = null;
// The shared connection: connect and disconnect change its state and tell the listener.
let mockConnectionState = 'connected';
let mockConnectFailures = 0;
let mockSnapshotArgs: boolean[] = [];
let mockSnapshotLimits: Array<number | undefined> = [];
const mockSetConnectionState = (state: string) => {
  mockConnectionState = state;
  mockStateListener?.(state);
};
const mockStreamingService = {
  addConnectionStateListener: (listener: (state: string) => void) => { mockStateListener = listener; },
  removeConnectionStateListener: () => undefined,
  getConnectionState: () => mockConnectionState,
  connect: async () => {
    if (mockConnectFailures > 0) {
      mockConnectFailures--;
      throw new Error('connection refused');
    }
    mockSetConnectionState('connected');
  },
  disconnect: () => mockSetConnectionState('disconnected'),
  convertToStreamFilter: (_filters: any, includeSnapshot: boolean, snapshotLimit?: number) => {
    mockSnapshotArgs.push(includeSnapshot);
    mockSnapshotLimits.push(snapshotLimit);
    return { filters: [], includeSnapshot, snapshotLimit };
  },
  subscribeToOrders: (_filter: any, callbacks: any) => {
    mockOrderCallbacks = callbacks;
    mockSubscribeCalls++;
    return { unsubscribe: () => { mockUnsubscribeCalls++; }, isActive: () => mockSubscriptionActive };
  },
  subscribeToExecutions: (_filter: any, callbacks: any) => {
    mockExecutionCallbacks = callbacks;
    mockSubscribeCalls++;
    return { unsubscribe: () => { mockUnsubscribeCalls++; }, isActive: () => mockSubscriptionActive };
  },
};
jest.mock('../services/RSocketStreamingService', () => ({
  RSocketStreamingService: {
    getInstance: () => mockStreamingService,
    normalizeOrderEvent: (event: any) => ({ ...event.order, id: event.order.orderId }),
  },
}));
let mockOrderCallbacks: any = null;
jest.mock('../services/ConfigService', () => ({
  ConfigService: { getConfig: async () => ({ streamingUrl: 'ws://test', maxStreamingRows: mockMaxStreamingRows }) },
  DEFAULT_STREAMING_URL: 'ws://test',
  DEFAULT_MAX_STREAMING_ROWS: 2000,
  getMaxStreamingRows: () => (typeof mockMaxStreamingRows === 'number' && mockMaxStreamingRows > 0 ? mockMaxStreamingRows : 2000),
}));
let mockMaxStreamingRows: number | undefined = 2000;
jest.mock('../services/MetamodelService', () => ({
  MetamodelService: {
    getInstance: () => ({
      getMetamodelAsync: async () => undefined,
      getMetamodel: () => ({
        displayName: 'Executions',
        defaultColumns: ['execId', 'orderId'],
        fields: [
          { name: 'execId', displayName: 'Exec Id', type: 'string' },
          { name: 'orderId', displayName: 'Order Id', type: 'string' },
          { name: 'id', displayName: 'Id', type: 'number' },
          { name: 'status', displayName: 'Status', type: 'string' },
        ],
        primaryKey: 'execId',
      }),
      getFilterableFields: () => [],
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
      saveState: (_domain: string, state: any) => {
        mockSavedColumns = state.visibleColumns;
        mockSaveCount++;
        mockSavedState = state; // persists like the real service
      },
    }),
  },
}));

const withPx = (event: any, avgPx: number) => ({ ...event, execution: { ...event.execution, avgPx } });
const fill = (orderId: string, execId: string) => ({
  eventType: 'NEW',
  execId,
  orderId,
  sequenceNumber: 1,
  timestamp: '2026-11-03T10:00:00Z',
  execution: { orderId, execId, avgPx: 10 },
});

let mockUnsubscribeCalls = 0;
let mockSubscribeCalls = 0;
let mockColumnArgs: string[][] = [];
let mockSavedState: any = null;
let mockSavedColumns: string[] | null = null;
let mockSaveCount = 0;
let mockSubscriptionActive = true;

beforeEach(() => {
  mockConnectionState = 'connected';
  mockConnectFailures = 0;
  mockSubscriptionActive = true;
  mockSnapshotArgs = [];
  mockSnapshotLimits = [];
  mockOrderCallbacks = null;
});

/** Lets pending connects, subscribes and re-renders finish, so extra subscriptions would show. */
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });

// SPEC-0056 AC-5 and AC-6: live mode shows the columns it can fill; the rest stay saved for History.
describe('StreamingBlotter columns (SPEC-0056)', () => {
  beforeEach(() => {
    mockColumnArgs = [];
    mockSavedState = null;
    mockSavedColumns = null;
  });

  it('live and paging blotters show the same default columns', async () => {
    render(<StreamingBlotter domainObject="Execution" />);

    // The paging blotter shows the metamodel's defaults; the live one asks for exactly the same.
    await waitFor(() => expect(mockColumnArgs[mockColumnArgs.length - 1]).toEqual(['execId', 'orderId']));
    expect(document.querySelector('.history-only-note')).toBeNull();
  });

  // The live blotter stays mounted while the paging one is shown; they share the saved choice.
  it('re-reads the shared saved columns when it becomes active, and saves only while active', async () => {
    mockSavedState = { filters: {}, visibleColumns: ['execId'], sortModel: [], pageSize: 100, currentPage: 1 };
    const { rerender } = render(<StreamingBlotter domainObject="Execution" active />);
    await waitFor(() => expect(mockColumnArgs[mockColumnArgs.length - 1]).toEqual(['execId']));

    rerender(<StreamingBlotter domainObject="Execution" active={false} />);
    const savesWhileHidden = mockSaveCount;
    mockSavedState = { ...mockSavedState, visibleColumns: ['execId', 'orderId'] }; // changed in paging mode
    rerender(<StreamingBlotter domainObject="Execution" active={false} />);
    expect(mockSaveCount).toBe(savesWhileHidden);

    rerender(<StreamingBlotter domainObject="Execution" active />);
    await waitFor(() => expect(mockColumnArgs[mockColumnArgs.length - 1]).toEqual(['execId', 'orderId']));
  });

  // SPEC-0056 (second review): the filter path of the re-read. An unchanged saved filter does not
  // re-subscribe; one changed in paging mode does.
  it('re-subscribes on activation only when the saved filters changed', async () => {
    mockSubscribeCalls = 0;
    mockSavedState = { filters: { orderId__like: 'O-1' }, visibleColumns: ['execId'], sortModel: [], pageSize: 100, currentPage: 1 };
    const { rerender } = render(<StreamingBlotter domainObject="Execution" active />);
    await waitFor(() => expect(mockSubscribeCalls).toBe(1));

    rerender(<StreamingBlotter domainObject="Execution" active={false} />);
    rerender(<StreamingBlotter domainObject="Execution" active />);
    await settle();
    expect(mockSubscribeCalls).toBe(1);

    rerender(<StreamingBlotter domainObject="Execution" active={false} />);
    mockSavedState = { ...mockSavedState, filters: { orderId__like: 'O-2' } }; // changed in paging mode
    rerender(<StreamingBlotter domainObject="Execution" active />);
    await waitFor(() => expect(mockSubscribeCalls).toBe(2));
  });

  it('hides history-only columns with a note', async () => {
    mockSavedState = { filters: {}, visibleColumns: ['execId', 'id', 'orderId', 'status'], sortModel: [], pageSize: 100, currentPage: 1 };
    render(<StreamingBlotter domainObject="Execution" />);

    await waitFor(() => expect(mockColumnArgs[mockColumnArgs.length - 1]).toEqual(['execId', 'orderId']));
    expect(document.querySelector('.history-only-note')?.textContent).toBe('History only: Id, Status');
    await waitFor(() => expect(mockSavedColumns).toEqual(['execId', 'id', 'orderId', 'status']));

    fireEvent.click(screen.getByRole('button', { name: 'Columns' }));
    const offered = Array.from(document.querySelectorAll('.column-selector-modal .column-item .field-name')).map(e => e.textContent);
    expect(offered).toEqual(['Exec Id', 'Order Id']);
  });
});

/** The row ids AG Grid would assign to the rows the blotter currently holds. */
const rowIds = () => Array.from(mockGrid?.rows.keys() ?? []);

describe('StreamingBlotter executions (SPEC-0041)', () => {
  beforeEach(() => {
    mockGridProps = null;
    mockExecutionCallbacks = null;
    mockMaxStreamingRows = 2000;
  });

  const renderAndSubscribe = async () => {
    render(<StreamingBlotter domainObject="Execution" />);
    await waitFor(() => expect(mockExecutionCallbacks).not.toBeNull());
  };

  // AC-5
  it('shows every fill of one order as its own row', async () => {
    await renderAndSubscribe();

    act(() => {
      mockExecutionCallbacks.onNext(fill('O-1', 'E-1'));
      mockExecutionCallbacks.onNext(fill('O-1', 'E-2'));
    });

    await waitFor(() => expect(gridRows()).toHaveLength(2));
    expect(new Set(rowIds()).size).toBe(2);
  });

  // AC-6
  it('keeps fills with the same execId on two orders apart', async () => {
    await renderAndSubscribe();

    act(() => {
      mockExecutionCallbacks.onNext(fill('O-1', 'E-1'));
      mockExecutionCallbacks.onNext(fill('O-2', 'E-1'));
    });

    await waitFor(() => expect(gridRows()).toHaveLength(2));
    expect(new Set(rowIds()).size).toBe(2);
  });
});

describe('StreamingBlotter rolling window (SPEC-0054)', () => {
  beforeEach(() => {
    mockGridProps = null;
    mockExecutionCallbacks = null;
    mockMaxStreamingRows = 2000;
    mockUnsubscribeCalls = 0;
    mockSubscribeCalls = 0;
  });

  const renderAndSubscribe = async () => {
    render(<StreamingBlotter domainObject="Execution" />);
    await waitFor(() => expect(mockExecutionCallbacks).not.toBeNull());
  };

  // AC-1
  it('caps rows at maxStreamingRows, evicting the oldest', async () => {
    mockMaxStreamingRows = 3;
    await renderAndSubscribe();

    act(() => {
      for (let i = 1; i <= 5; i++) {
        mockExecutionCallbacks.onNext(fill(`O-${i}`, `E-${i}`));
      }
    });

    await waitFor(() => expect(gridRows()).toHaveLength(3));
    expect(rowIds()).toEqual(['O-3|E-3', 'O-4|E-4', 'O-5|E-5']);
    // The toolbar record count reflects the window, not the event count
    expect(screen.getByText('3 records')).toBeInTheDocument();
  });

  // AC-2
  it('reads maxStreamingRows from config', async () => {
    mockMaxStreamingRows = 2;
    await renderAndSubscribe();

    act(() => {
      for (let i = 1; i <= 4; i++) {
        mockExecutionCallbacks.onNext(fill(`O-${i}`, `E-${i}`));
      }
    });

    await waitFor(() => expect(gridRows()).toHaveLength(2));
    expect(rowIds()).toEqual(['O-3|E-3', 'O-4|E-4']);
  });

  // AC-2
  it('falls back to the default when config is missing or invalid', async () => {
    mockMaxStreamingRows = undefined;
    await renderAndSubscribe();

    act(() => {
      for (let i = 1; i <= 2001; i++) {
        mockExecutionCallbacks.onNext(fill(`O-${i}`, `E-${i}`));
      }
    });

    await waitFor(() => expect(gridRows()).toHaveLength(2000));
  });

  // SPEC-0057 AC-1: a frame's events reach the grid as one transaction with exactly what changed; the
  // events themselves render nothing, and the grid is never handed all rows.
  it("applies a frame's events as one delta transaction", async () => {
    mockMaxStreamingRows = 300;
    let commits = 0;
    render(
      <React.Profiler id="blotter" onRender={() => { commits++; }}>
        <StreamingBlotter domainObject="Execution" />
      </React.Profiler>
    );
    await waitFor(() => expect(mockExecutionCallbacks).not.toBeNull());
    act(() => {
      for (let i = 1; i <= 20; i++) {
        mockExecutionCallbacks.onNext(fill(`O-${i}`, `S-${i}`));
      }
    });
    await waitFor(() => expect(gridRows()).toHaveLength(20));
    const transactionsBefore = mockGrid!.transactions.length;
    const initialRowData = mockGridProps.rowData;

    mockManualFrames = true;
    try {
      commits = 0;
      act(() => {
        for (let i = 1; i <= 490; i++) {
          mockExecutionCallbacks.onNext(fill(`N-${i}`, `E-${i}`)); // 490 new rows
        }
        for (let i = 1; i <= 10; i++) {
          mockExecutionCallbacks.onNext({ ...fill(`O-${i}`, `S-${i}`), execution: { orderId: `O-${i}`, execId: `S-${i}`, avgPx: 11 } });
        }
      });
      expect(commits).toBe(0);
      expect(mockGrid!.transactions.length).toBe(transactionsBefore);

      act(() => runFrames());
    } finally {
      mockManualFrames = false;
    }

    expect(mockGrid!.transactions.length).toBe(transactionsBefore + 1);
    const transaction = mockGrid!.transactions[transactionsBefore];
    // Cap 300: 500 rows were touched; the 200 oldest are gone. Of the rows the grid held, S-11..S-20
    // went longest without an update and are removed; S-1..S-10 were updated and stay.
    expect(transaction.update.map((r: any) => r.execId)).toEqual(Array.from({ length: 10 }, (_, i) => `S-${i + 1}`));
    expect(transaction.update.every((r: any) => r.avgPx === 11)).toBe(true);
    expect(transaction.remove.map((r: any) => r.execId).sort()).toEqual(Array.from({ length: 10 }, (_, i) => `S-${i + 11}`).sort());
    expect(transaction.add).toHaveLength(290);
    expect(transaction.add[0].execId).toBe('E-201');
    expect(gridRows()).toHaveLength(300);
    expect(commits).toBeLessThanOrEqual(1);
    expect(screen.getByText('300 records')).toBeInTheDocument();
    expect(screen.getByText('Events: 520')).toBeInTheDocument();
    // AG Grid shows its loading overlay and renders no rows until it is given rowData once; the
    // blotter gives it one empty array, the same on every render, and feeds rows by transaction only.
    expect(mockGridProps.rowData).toEqual([]);
    expect(mockGridProps.rowData).toBe(initialRowData);
  });

  // SPEC-0057 AC-5: the snapshot (at most maxStreamingRows, newest first) is held back until its end
  // marker, then reaches the grid in one transaction, oldest first.
  it('adds the snapshot in one transaction at its end', async () => {
    mockMaxStreamingRows = 3;
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    await renderAndSubscribe();
    expect(mockSnapshotLimits[mockSnapshotLimits.length - 1]).toBe(3);
    const transactionsBefore = mockGrid!.transactions.length;

    act(() => {
      ['S4', 'S3', 'S2', 'S1'].forEach(id => // newest first; S1 is beyond the cap
        mockExecutionCallbacks.onNext({ ...fill(`O-${id}`, id), eventType: 'SNAPSHOT' }));
    });
    await settle();
    expect(gridRows()).toHaveLength(0);
    expect(mockGrid!.transactions.slice(transactionsBefore).every((t: any) => t.add.length === 0)).toBe(true);

    act(() => mockExecutionCallbacks.onNext({ eventType: 'SNAPSHOT_END', snapshotTotal: 8300 }));
    await waitFor(() => expect(gridRows()).toHaveLength(3));

    const adds = mockGrid!.transactions.slice(transactionsBefore).filter((t: any) => t.add.length > 0);
    expect(adds).toHaveLength(1);
    expect(adds[0].add.map((r: any) => r.execId)).toEqual(['S2', 'S3', 'S4']);
    expect(screen.getByText('3 records')).toBeInTheDocument();
    expect(info.mock.calls.some(call => /Execution snapshot shown: 3 rows/.test(String(call[0])))).toBe(true);
    info.mockRestore();
  });

  // SPEC-0057 AC-5, an older server without the marker: the first live event ends the snapshot.
  it('a live event ends a snapshot that has no end marker', async () => {
    await renderAndSubscribe();

    act(() => {
      mockExecutionCallbacks.onNext({ ...fill('O-1', 'S1'), eventType: 'SNAPSHOT' });
      mockExecutionCallbacks.onNext(fill('O-2', 'L1'));
    });

    await waitFor(() => expect(rowIds()).toEqual(['O-1|S1', 'O-2|L1']));
  });

  // SPEC-0057 AC-5, an older server without the marker and no live events (a quiet market): the
  // snapshot is shown once no snapshot row has arrived for a while.
  it('shows a snapshot without an end marker once it goes quiet', async () => {
    await renderAndSubscribe();

    act(() => {
      mockExecutionCallbacks.onNext({ ...fill('O-2', 'S2'), eventType: 'SNAPSHOT' });
      mockExecutionCallbacks.onNext({ ...fill('O-1', 'S1'), eventType: 'SNAPSHOT' });
    });
    await settle();
    expect(gridRows()).toHaveLength(0);

    await waitFor(() => expect(rowIds()).toEqual(['O-1|S1', 'O-2|S2']), { timeout: 3000 });
    expect(document.querySelector('.showing-count')?.textContent).toBe('Showing 2');
  });

  // SPEC-0057 (review): a page of the order snapshot can take longer than the quiet fallback
  // (1 s). The snapshot is then shown early; the rows that come later are older than those shown and
  // must not evict them, and the late marker still sets M.
  it('a late marker and late rows after the quiet fallback keep the newest rows and M', async () => {
    mockMaxStreamingRows = 3;
    await renderAndSubscribe();
    const showing = () => document.querySelector('.showing-count')?.textContent;

    act(() => {
      mockExecutionCallbacks.onNext({ ...fill('O-5', 'S5'), eventType: 'SNAPSHOT' }); // newest first
      mockExecutionCallbacks.onNext({ ...fill('O-4', 'S4'), eventType: 'SNAPSHOT' });
    });
    await waitFor(() => expect(gridRows()).toHaveLength(2), { timeout: 3000 }); // the quiet fallback

    act(() => {
      ['S3', 'S2', 'S1'].forEach(id => mockExecutionCallbacks.onNext({ ...fill(`O-${id.slice(1)}`, id), eventType: 'SNAPSHOT' }));
      mockExecutionCallbacks.onNext({ eventType: 'SNAPSHOT_END', snapshotTotal: 8300 });
    });

    await waitFor(() => expect(showing()).toBe('Showing 3 of 8,300'));
    expect(rowIds().sort()).toEqual(['O-3|S3', 'O-4|S4', 'O-5|S5']);
  });

  it('asks for no snapshot rows when the snapshot is off', async () => {
    await renderAndSubscribe();
    fireEvent.click(screen.getByLabelText('Include Snapshot'));
    await waitFor(() => expect(mockSnapshotArgs[mockSnapshotArgs.length - 1]).toBe(false));

    act(() => mockExecutionCallbacks.onNext(fill('O-1', 'L1')));
    await waitFor(() => expect(rowIds()).toEqual(['O-1|L1']));
  });

  // SPEC-0057 AC-7: Pause freezes the grid while events keep arriving into the bounded store; Resume
  // shows each row's latest state in one transaction.
  it('pause holds the grid and resume applies the latest state', async () => {
    await renderAndSubscribe();
    act(() => mockExecutionCallbacks.onNext(withPx(fill('O-1', 'E-1'), 10)));
    await waitFor(() => expect(gridRows()).toHaveLength(1));

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    const transactionsAtPause = mockGrid!.transactions.length;
    act(() => {
      mockExecutionCallbacks.onNext(withPx(fill('O-1', 'E-1'), 11));
      mockExecutionCallbacks.onNext(withPx(fill('O-1', 'E-1'), 12));
      mockExecutionCallbacks.onNext(withPx(fill('O-1', 'E-1'), 13));
      mockExecutionCallbacks.onNext(withPx(fill('O-2', 'E-2'), 20));
    });
    await waitFor(() => expect(document.querySelector('.paused-note')?.textContent).toBe('Paused — 4 updates pending'));
    await settle();
    expect(mockGrid!.transactions.length).toBe(transactionsAtPause);
    expect(gridRows().map((r: any) => r.avgPx)).toEqual([10]);

    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    await waitFor(() => expect(gridRows().map((r: any) => r.avgPx)).toEqual([13, 20]));
    expect(mockGrid!.transactions.length).toBe(transactionsAtPause + 1);
    expect(document.querySelector('.paused-note')).toBeNull();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
  });

  it('stays within the cap while paused', async () => {
    mockMaxStreamingRows = 5;
    await renderAndSubscribe();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

    act(() => {
      for (let i = 1; i <= 1000; i++) {
        mockExecutionCallbacks.onNext(fill(`O-${i}`, `E-${i}`));
      }
    });
    await waitFor(() => expect(document.querySelector('.paused-note')?.textContent).toBe('Paused — 1,000 updates pending'));
    expect(screen.getByText('5 records')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    await waitFor(() => expect(rowIds()).toEqual(['O-996|E-996', 'O-997|E-997', 'O-998|E-998', 'O-999|E-999', 'O-1000|E-1000']));
  });

  // SPEC-0057 (review): a hidden blotter does not even schedule frames for its events.
  it('a hidden blotter schedules no frames', async () => {
    const { rerender } = render(<StreamingBlotter domainObject="Execution" active />);
    await waitFor(() => expect(mockExecutionCallbacks).not.toBeNull());
    rerender(<StreamingBlotter domainObject="Execution" active={false} />);
    await settle();

    mockManualFrames = true;
    try {
      act(() => mockExecutionCallbacks.onNext(fill('O-1', 'E-1')));
      expect(mockFrames).toHaveLength(0);
    } finally {
      mockManualFrames = false;
      mockFrames = [];
    }
  });

  // SPEC-0057 AC-7: a hidden view (SPEC-0056) behaves as paused and catches up when shown.
  it('a hidden blotter catches up when shown', async () => {
    const { rerender } = render(<StreamingBlotter domainObject="Execution" active />);
    await waitFor(() => expect(mockExecutionCallbacks).not.toBeNull());
    act(() => mockExecutionCallbacks.onNext(withPx(fill('O-1', 'E-1'), 10)));
    await waitFor(() => expect(gridRows()).toHaveLength(1));

    rerender(<StreamingBlotter domainObject="Execution" active={false} />);
    const transactionsWhenHidden = mockGrid!.transactions.length;
    act(() => {
      mockExecutionCallbacks.onNext(withPx(fill('O-1', 'E-1'), 11));
      mockExecutionCallbacks.onNext(withPx(fill('O-2', 'E-2'), 20));
    });
    await settle();
    expect(mockGrid!.transactions.length).toBe(transactionsWhenHidden);

    rerender(<StreamingBlotter domainObject="Execution" active />);
    await waitFor(() => expect(gridRows().map((r: any) => r.avgPx)).toEqual([11, 20]));
    expect(mockGrid!.transactions.length).toBe(transactionsWhenHidden + 1);
    expect(screen.getByText('Events: 3')).toBeInTheDocument();
  });

  // SPEC-0057 AC-8: how much of what matches on the server the blotter shows.
  it('shows N of M for executions', async () => {
    mockMaxStreamingRows = 3;
    await renderAndSubscribe();
    const showing = () => document.querySelector('.showing-count')?.textContent;

    act(() => {
      ['S3', 'S2', 'S1'].forEach(id => mockExecutionCallbacks.onNext({ ...fill(`O-${id}`, id), eventType: 'SNAPSHOT' }));
      mockExecutionCallbacks.onNext({ eventType: 'SNAPSHOT_END', snapshotTotal: 8300 });
    });
    await waitFor(() => expect(showing()).toBe('Showing 3 of 8,300'));

    // Every live fill is a new row on the server.
    act(() => {
      mockExecutionCallbacks.onNext(fill('O-L', 'L1'));
      mockExecutionCallbacks.onNext(fill('O-L', 'L2'));
      mockExecutionCallbacks.onNext(fill('O-L', 'L3'));
    });
    await waitFor(() => expect(showing()).toBe('Showing 3 of 8,303'));
  });

  it('shows N of M for orders, counting orders created since the snapshot', async () => {
    mockMaxStreamingRows = 2000;
    render(<StreamingBlotter domainObject="Order" />);
    await waitFor(() => expect(mockOrderCallbacks).not.toBeNull());
    const showing = () => document.querySelector('.showing-count')?.textContent;
    const order = (orderId: string, eventId: number, eventType = 'UPDATE') =>
      ({ eventType, orderId, eventId, order: { orderId, eventId, symbol: 'AAPL' } });

    act(() => {
      mockOrderCallbacks.onNext(order('A', 4, 'SNAPSHOT'));
      mockOrderCallbacks.onNext(order('B', 2, 'SNAPSHOT'));
      mockOrderCallbacks.onNext({ eventType: 'SNAPSHOT_END', snapshotTotal: 8300 });
    });
    await waitFor(() => expect(showing()).toBe('Showing 2 of 8,300'));

    act(() => {
      mockOrderCallbacks.onNext(order('C', 1)); // created after the snapshot: its first version
      mockOrderCallbacks.onNext(order('D', 1));
      mockOrderCallbacks.onNext(order('E', 1));
      mockOrderCallbacks.onNext(order('A', 5)); // an update: not a new order
    });
    await waitFor(() => expect(showing()).toBe('Showing 5 of 8,303'));
  });

  it('shows only N without a snapshot', async () => {
    await renderAndSubscribe();
    fireEvent.click(screen.getByLabelText('Include Snapshot'));
    await waitFor(() => expect(mockSnapshotArgs[mockSnapshotArgs.length - 1]).toBe(false));

    act(() => mockExecutionCallbacks.onNext(fill('O-1', 'L1')));
    await waitFor(() => expect(document.querySelector('.showing-count')?.textContent).toBe('Showing 1'));
  });

  // SPEC-0057 AC-9, AC-10: the blotter renders once per frame; new column or default column
  // definitions on each render make AG Grid rebuild its columns every frame, costing frame time and
  // memory (seen in the 10-minute harness run).
  it('hands the grid the same column definitions on every flush', async () => {
    await renderAndSubscribe();
    const columnDefs = mockGridProps.columnDefs;
    const defaultColDef = mockGridProps.defaultColDef;

    for (let i = 1; i <= 3; i++) {
      act(() => mockExecutionCallbacks.onNext(fill(`O-${i}`, `E-${i}`)));
      await waitFor(() => expect(gridRows()).toHaveLength(i));
    }

    expect(mockGridProps.columnDefs).toBe(columnDefs);
    expect(mockGridProps.defaultColDef).toBe(defaultColDef);
  });

  // SPEC-0057 AC-9: the counters render once per frame, but the grid must not. A re-rendered
  // AgGridReact re-checks its options and re-renders its rows; with rows drawn, that made the frame
  // p95 127 ms at 2,000 events/s. Row animation is off: under churn every eviction would animate
  // every row below it.
  it('does not re-render the grid when only the counters change', async () => {
    await renderAndSubscribe();
    act(() => mockExecutionCallbacks.onNext(fill('O-0', 'E-0')));
    await waitFor(() => expect(gridRows()).toHaveLength(1));
    const rendersBefore = mockGridRenders;

    for (let i = 1; i <= 3; i++) {
      act(() => mockExecutionCallbacks.onNext(fill(`O-${i}`, `E-${i}`)));
      await waitFor(() => expect(screen.getByText(`Events: ${i + 1}`)).toBeInTheDocument());
    }

    expect(gridRows()).toHaveLength(4);
    expect(mockGridRenders).toBe(rendersBefore);
    expect(mockGridProps.animateRows).toBe(false);
  });

  // SPEC-0057: a transaction AG Grid refuses (it returns nothing when its module is not registered)
  // is not reported as applied, so the load harness cannot count events the grid never showed.
  it('reports a flush as applied only when the grid accepts the transaction', async () => {
    const flushed: number[] = [];
    render(<StreamingBlotter domainObject="Execution" onFlush={n => flushed.push(n)} />);
    await waitFor(() => expect(mockExecutionCallbacks).not.toBeNull());
    await waitFor(() => expect(mockGrid).not.toBeNull());
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGrid!.api.applyTransaction = () => undefined; // as AG Grid does without the module

    act(() => mockExecutionCallbacks.onNext(fill('O-1', 'E-1')));
    await settle();

    expect(flushed.filter(eventsApplied => eventsApplied > 0)).toEqual([]); // empty flushes before the event are fine
    expect(error.mock.calls.some(call => /grid did not apply/.test(String(call[0])))).toBe(true);
    error.mockRestore();
  });

  // SPEC-0058 AC-8: columns fill the panel; they are not sized to the headers on an empty grid.
  it('fits the columns to the grid width instead of auto-sizing an empty grid', async () => {
    await renderAndSubscribe();
    const strategy = mockGridProps.autoSizeStrategy;
    expect(strategy).toEqual({ type: 'fitGridWidth', defaultMinWidth: 110 });

    act(() => mockExecutionCallbacks.onNext(fill('O-1', 'E-1')));
    await waitFor(() => expect(gridRows()).toHaveLength(1));
    expect(mockGridProps.autoSizeStrategy).toBe(strategy);
    expect(mockAutoSizeCalls).toBe(0);
    let fitted = 0;
    mockGridProps.onGridSizeChanged({ api: { sizeColumnsToFit: () => { fitted++; } } });
    mockGridProps.onNewColumnsLoaded({ api: { sizeColumnsToFit: () => { fitted++; } } });
    expect(fitted).toBe(2);
  });

  it('gives each toolbar action an icon and keeps its name', async () => {
    await renderAndSubscribe();

    ['Columns', 'Auto-Size', 'Pause', 'Disconnect'].forEach(name => {
      expect(screen.getByRole('button', { name }).querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    });
  });

  // AC-7
  it('resets the window and event counter and re-subscribes on reconnect', async () => {
    await renderAndSubscribe();
    const subscribeCallsBefore = mockSubscribeCalls;

    act(() => {
      for (let i = 1; i <= 5; i++) {
        mockExecutionCallbacks.onNext(fill(`O-${i}`, `E-${i}`));
      }
    });
    await waitFor(() => expect(gridRows()).toHaveLength(5));

    act(() => {
      mockExecutionCallbacks.onError(new Error('connection lost'));
    });
    fireEvent.click(screen.getByText('Retry'));

    // The stream re-subscribes after the reconnect
    await waitFor(() => expect(mockSubscribeCalls).toBe(subscribeCallsBefore + 1));
    // The window and event counter were reset
    await waitFor(() => expect(gridRows()).toHaveLength(0));
    expect(screen.getByText('Events: 0')).toBeInTheDocument();
  });

  // AC-3
  // SPEC-0056 AC-1: a blotter mounted after a tab or mode switch joins an already open connection.
  it("shows the shared connection's current state when it mounts", async () => {
    render(<StreamingBlotter domainObject="Execution" />);

    const status = () => document.querySelector('.streaming-status') as HTMLElement;
    await waitFor(() => expect(status().textContent).toBe('connected'));
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Connect' })).toBeNull();

    act(() => mockStateListener!('reconnecting'));
    expect(status().textContent).toBe('reconnecting');
    expect(screen.getByRole('button', { name: 'Connect' })).toBeTruthy();

    act(() => mockStateListener!('error'));
    expect(status().textContent).toBe('error');
  });

  // SPEC-0056 AC-4: changing what is streamed still subscribes again with a fresh snapshot.
  it('re-subscribes with a snapshot when filters or the snapshot option change', async () => {
    render(<StreamingBlotter domainObject="Execution" />);
    await waitFor(() => expect(mockSubscribeCalls).toBe(1));

    fireEvent.click(screen.getByLabelText('Include Snapshot'));
    await waitFor(() => expect(mockSubscribeCalls).toBe(2));
    fireEvent.click(screen.getByLabelText('Include Snapshot'));
    await waitFor(() => expect(mockSubscribeCalls).toBe(3));

    fireEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply Filters' }));
    await waitFor(() => expect(mockSubscribeCalls).toBe(4));

    // Each subscription asked for the snapshot as the option stood: on, off, on, on.
    expect(mockSnapshotArgs).toEqual([true, false, true, true]);
  });

  // SPEC-0056 (second review): after Disconnect, a filter change re-opens the connection itself;
  // that must not also count as "the connection came back" and subscribe a second time.
  it('subscribes once when a change re-opens the connection after Disconnect', async () => {
    render(<StreamingBlotter domainObject="Execution" />);
    await waitFor(() => expect(mockSubscribeCalls).toBe(1));

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    fireEvent.click(screen.getByLabelText('Include Snapshot'));
    await waitFor(() => expect(mockSubscribeCalls).toBe(2));
    await settle();
    expect(mockSubscribeCalls).toBe(2);
  });

  // SPEC-0056 (second review): if the blotter's own connect failed, it subscribes once the shared
  // connection comes back (the service reconnects by itself), instead of showing Connected idle.
  it('subscribes when the connection comes back after its own connect failed', async () => {
    mockConnectionState = 'disconnected';
    mockConnectFailures = 1;
    render(<StreamingBlotter domainObject="Execution" />);
    await waitFor(() => expect(screen.getByText(/connection refused/)).toBeTruthy());
    expect(mockSubscribeCalls).toBe(0);

    act(() => mockSetConnectionState('connected'));
    await waitFor(() => expect(mockSubscribeCalls).toBe(1));
    await settle();
    expect(mockSubscribeCalls).toBe(1);
  });

  // SPEC-0056 (review): Connect in another live blotter re-opens the shared connection; a blotter
  // whose stream died with the old connection subscribes again instead of showing Connected idle.
  it('re-subscribes when the shared connection comes back and its stream died', async () => {
    mockSubscriptionActive = true;
    render(<StreamingBlotter domainObject="Execution" />);
    await waitFor(() => expect(mockSubscribeCalls).toBe(1));

    act(() => mockStateListener!('connected')); // still alive: nothing to do
    expect(mockSubscribeCalls).toBe(1);

    mockSubscriptionActive = false;
    act(() => mockStateListener!('disconnected'));
    act(() => mockStateListener!('connected'));
    await waitFor(() => expect(mockSubscribeCalls).toBe(2));
    mockSubscriptionActive = true;
  });

  it('unsubscribes the stream on unmount', async () => {
    const { unmount } = render(<StreamingBlotter domainObject="Execution" />);
    await waitFor(() => expect(mockExecutionCallbacks).not.toBeNull());
    expect(mockUnsubscribeCalls).toBe(0);

    unmount();

    expect(mockUnsubscribeCalls).toBe(1);
  });

  // AC-6
  it('noEmojiInToolbar: toolbar and status bar contain no emoji glyphs', async () => {
    await renderAndSubscribe();

    act(() => {
      mockExecutionCallbacks.onNext(fill('O-1', 'E-1'));
    });
    await waitFor(() => expect(gridRows()).toHaveLength(1));

    const container = document.querySelector('.blotter-container') as HTMLElement;
    expect(container.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{25FB}-\u{25FE}]/u);
  });
});
