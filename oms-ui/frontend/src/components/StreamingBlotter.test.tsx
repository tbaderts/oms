import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import StreamingBlotter from './StreamingBlotter';

// AG Grid is stubbed: the test reads the rows and the getRowId the blotter hands it.
let mockGridProps: any = null;
jest.mock('ag-grid-react', () => ({
  AgGridReact: (props: any) => {
    mockGridProps = props;
    return null;
  },
}));
jest.mock('../theme/agGridTheme', () => ({ omsGridTheme: {} }));

// Plain functions, not jest.fn: CRA's jest config resets mock implementations before each test.
let mockExecutionCallbacks: any = null;
const mockStreamingService = {
  addConnectionStateListener: () => undefined,
  removeConnectionStateListener: () => undefined,
  getConnectionState: () => 'connected',
  connect: async () => undefined,
  disconnect: () => undefined,
  convertToStreamFilter: () => ({ filters: [], includeSnapshot: true }),
  subscribeToOrders: () => undefined,
  subscribeToExecutions: (_filter: any, callbacks: any) => {
    mockExecutionCallbacks = callbacks;
    mockSubscribeCalls++;
    return { unsubscribe: () => { mockUnsubscribeCalls++; }, isActive: () => true };
  },
};
jest.mock('../services/RSocketStreamingService', () => ({
  RSocketStreamingService: { getInstance: () => mockStreamingService },
}));
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
      getMetamodel: () => ({ displayName: 'Executions', defaultColumns: ['execId'], fields: [], primaryKey: 'execId' }),
    }),
  },
}));
jest.mock('../services/ColumnConfigService', () => ({
  ColumnConfigService: { getInstance: () => ({ getColumnConfig: () => [] }) },
}));
jest.mock('../services/BlotterStateService', () => ({
  BlotterStateService: { getInstance: () => ({ getState: () => null, saveState: jest.fn() }) },
}));

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

/** The row ids AG Grid would assign to the rows the blotter currently holds. */
const rowIds = () => mockGridProps.rowData.map((data: any) => mockGridProps.getRowId({ data }));

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

    await waitFor(() => expect(mockGridProps.rowData).toHaveLength(2));
    expect(new Set(rowIds()).size).toBe(2);
  });

  // AC-6
  it('keeps fills with the same execId on two orders apart', async () => {
    await renderAndSubscribe();

    act(() => {
      mockExecutionCallbacks.onNext(fill('O-1', 'E-1'));
      mockExecutionCallbacks.onNext(fill('O-2', 'E-1'));
    });

    await waitFor(() => expect(mockGridProps.rowData).toHaveLength(2));
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

    await waitFor(() => expect(mockGridProps.rowData).toHaveLength(3));
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

    await waitFor(() => expect(mockGridProps.rowData).toHaveLength(2));
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

    await waitFor(() => expect(mockGridProps.rowData).toHaveLength(2000));
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
    await waitFor(() => expect(mockGridProps.rowData).toHaveLength(5));

    act(() => {
      mockExecutionCallbacks.onError(new Error('connection lost'));
    });
    fireEvent.click(screen.getByText('Retry'));

    // The stream re-subscribes after the reconnect
    await waitFor(() => expect(mockSubscribeCalls).toBe(subscribeCallsBefore + 1));
    // The window and event counter were reset
    await waitFor(() => expect(mockGridProps.rowData).toHaveLength(0));
    expect(screen.getByText('Events: 0')).toBeInTheDocument();
  });

  // AC-3
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
    await waitFor(() => expect(mockGridProps.rowData).toHaveLength(1));

    const container = document.querySelector('.blotter-container') as HTMLElement;
    expect(container.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{25FB}-\u{25FE}]/u);
  });
});
