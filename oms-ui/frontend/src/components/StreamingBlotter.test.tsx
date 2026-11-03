import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
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
    return { unsubscribe: () => undefined, isActive: () => true };
  },
};
jest.mock('../services/RSocketStreamingService', () => ({
  RSocketStreamingService: { getInstance: () => mockStreamingService },
}));
jest.mock('../services/ConfigService', () => ({
  ConfigService: { getConfig: async () => ({ streamingUrl: 'ws://test' }) },
  DEFAULT_STREAMING_URL: 'ws://test',
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

/** The row ids AG Grid would assign to the rows the blotter currently holds. */
const rowIds = () => mockGridProps.rowData.map((data: any) => mockGridProps.getRowId({ data }));

describe('StreamingBlotter executions (SPEC-0041)', () => {
  beforeEach(() => {
    mockGridProps = null;
    mockExecutionCallbacks = null;
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
