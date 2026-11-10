import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';

// SPEC-0056 AC-2 and AC-3: switching tabs or modes keeps each live blotter's subscription and rows.
// The live blotters are real; the streaming service is mocked to count subscriptions and to emit
// events while a blotter is hidden. The REST blotters are stubbed.

jest.mock('ag-grid-react', () => ({ AgGridReact: () => null }));
jest.mock('./theme/agGridTheme', () => ({ omsGridTheme: {} }));
jest.mock('./components/OrderBlotter', () => (props: any) => (
  <div className="rest-order-blotter" data-active={String(props.active)}>REST orders</div>
));
jest.mock('./components/ExecutionBlotter', () => () => <div className="rest-execution-blotter">REST executions</div>);

let mockOrderSubscriptions = 0;
let mockExecutionSubscriptions = 0;
let mockOrderCallbacks: any = null;
// A shared connection: disconnect ends every stream on it and tells every blotter.
let mockState = 'connected';
let mockGeneration = 0;
const mockListeners = new Set<(state: string) => void>();
const mockSetState = (state: string) => {
  mockState = state;
  mockListeners.forEach(listener => listener(state));
};
const mockStream = () => {
  const generation = mockGeneration;
  return { unsubscribe: () => undefined, isActive: () => generation === mockGeneration };
};
const mockStreamingService = {
  addConnectionStateListener: (listener: any) => { mockListeners.add(listener); },
  removeConnectionStateListener: (listener: any) => { mockListeners.delete(listener); },
  getConnectionState: () => mockState,
  connect: async () => { mockSetState('connected'); },
  disconnect: () => { mockGeneration++; mockSetState('disconnected'); },
  convertToStreamFilter: () => ({ filters: [], includeSnapshot: true }),
  subscribeToOrders: (_filter: any, callbacks: any) => {
    mockOrderSubscriptions++;
    mockOrderCallbacks = callbacks;
    return mockStream();
  },
  subscribeToExecutions: () => {
    mockExecutionSubscriptions++;
    return mockStream();
  },
};
jest.mock('./services/RSocketStreamingService', () => ({
  RSocketStreamingService: {
    getInstance: () => mockStreamingService,
    normalizeOrderEvent: (event: any) => ({ ...event.order, id: event.order.orderId }),
  },
}));
jest.mock('./services/ConfigService', () => ({
  ConfigService: {
    getConfig: async () => ({ appName: 'OMS', streamingUrl: 'ws://test', maxStreamingRows: 2000 }),
    getFeatureFlags: () => ({ quotesEnabled: false, quoteRequestsEnabled: false, streamingEnabled: true }),
  },
  DEFAULT_FEATURE_FLAGS: { quotesEnabled: false, quoteRequestsEnabled: false, streamingEnabled: true },
  DEFAULT_STREAMING_URL: 'ws://test',
  DEFAULT_MAX_STREAMING_ROWS: 2000,
  getMaxStreamingRows: () => 2000,
}));
jest.mock('./services/MetamodelService', () => ({
  MetamodelService: {
    getInstance: () => ({
      getMetamodelAsync: async () => undefined,
      getMetamodel: () => ({ displayName: 'Blotter', defaultColumns: ['orderId'], fields: [], primaryKey: 'orderId' }),
    }),
  },
}));
jest.mock('./services/ColumnConfigService', () => ({
  ColumnConfigService: { getInstance: () => ({ getColumnConfig: () => [] }) },
}));
jest.mock('./services/BlotterStateService', () => ({
  BlotterStateService: { getInstance: () => ({ getState: () => null, saveState: () => undefined }) },
}));

const order = (orderId: string) => ({
  eventType: 'NEW',
  orderId,
  eventId: 1,
  sequenceNumber: 1,
  timestamp: '2026-11-09T10:00:00Z',
  order: { orderId, symbol: 'AAPL', side: 'BUY' },
});

/** The live Orders blotter's event counter, wherever it is (shown or hidden). */
const ordersEventCount = () => {
  const blotters = Array.from(document.querySelectorAll('.streaming-blotter'));
  const orders = blotters.find(b => b.querySelector('h2')?.textContent === 'Blotter' && b.closest('[data-view="streaming:orders"]'));
  return orders?.querySelector('.event-count')?.textContent;
};

beforeEach(() => {
  mockOrderSubscriptions = 0;
  mockExecutionSubscriptions = 0;
  mockOrderCallbacks = null;
  mockState = 'connected';
  mockGeneration = 0;
  mockListeners.clear();
});

// SPEC-0056 (review): only the shown view is active; the hidden ones know it.
test('tells each blotter whether its view is shown', async () => {
  render(<App />);
  await waitFor(() => expect(mockOrderSubscriptions).toBe(1));
  fireEvent.click(screen.getByRole('button', { name: 'REST' }));
  expect(document.querySelector('.rest-order-blotter')?.getAttribute('data-active')).toBe('true');

  fireEvent.click(screen.getByRole('button', { name: 'Streaming' }));
  expect(document.querySelector('.rest-order-blotter')?.getAttribute('data-active')).toBe('false');
});

// SPEC-0056 (review): Connect in one live blotter re-opens the shared connection; the hidden live
// blotter, whose stream ended with the old connection, subscribes again.
test('a reconnect in one live blotter re-subscribes the hidden one', async () => {
  render(<App />);
  await waitFor(() => expect(mockOrderSubscriptions).toBe(1));
  fireEvent.click(screen.getByRole('button', { name: 'Executions' }));
  await waitFor(() => expect(mockExecutionSubscriptions).toBe(1));

  const executions = () => document.querySelector('[data-view="streaming:executions"]') as HTMLElement;
  fireEvent.click(executions().querySelector('.disconnect-button') as HTMLElement);
  await waitFor(() => expect(executions().querySelector('.connect-button')).not.toBeNull());
  await act(async () => {
    fireEvent.click(executions().querySelector('.connect-button') as HTMLElement);
  });

  await waitFor(() => expect(mockOrderSubscriptions).toBe(2));
  await waitFor(() => expect(mockExecutionSubscriptions).toBe(2));
  // Exactly once each: the blotter that clicked Connect does not subscribe twice.
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
  expect(mockOrderSubscriptions).toBe(2);
  expect(mockExecutionSubscriptions).toBe(2);
});

test('switching tabs and modes subscribes each live blotter once', async () => {
  render(<App />);
  await waitFor(() => expect(mockOrderSubscriptions).toBe(1));
  act(() => mockOrderCallbacks.onNext(order('O-1')));
  await waitFor(() => expect(ordersEventCount()).toBe('Events: 1'));

  fireEvent.click(screen.getByRole('button', { name: 'Executions' }));
  await waitFor(() => expect(mockExecutionSubscriptions).toBe(1));
  fireEvent.click(screen.getByRole('button', { name: 'Orders' }));
  fireEvent.click(screen.getByRole('button', { name: 'REST' }));
  fireEvent.click(screen.getByRole('button', { name: 'Streaming' }));
  fireEvent.click(screen.getByRole('button', { name: 'Executions' }));
  fireEvent.click(screen.getByRole('button', { name: 'Orders' }));

  await waitFor(() => expect(ordersEventCount()).toBe('Events: 1'));
  expect(mockOrderSubscriptions).toBe(1);
  expect(mockExecutionSubscriptions).toBe(1);
  expect(document.querySelector('[data-view="streaming:orders"] .record-count')?.textContent).toBe('1 records');
});

test('a hidden live blotter keeps receiving events', async () => {
  render(<App />);
  await waitFor(() => expect(mockOrderSubscriptions).toBe(1));
  act(() => mockOrderCallbacks.onNext(order('O-1')));

  fireEvent.click(screen.getByRole('button', { name: 'Executions' }));
  await waitFor(() => expect(mockExecutionSubscriptions).toBe(1));
  act(() => mockOrderCallbacks.onNext(order('O-2')));
  act(() => mockOrderCallbacks.onNext(order('O-3')));
  fireEvent.click(screen.getByRole('button', { name: 'Orders' }));

  await waitFor(() => expect(ordersEventCount()).toBe('Events: 3'));
  expect(document.querySelector('[data-view="streaming:orders"] .record-count')?.textContent).toBe('3 records');
  expect(mockOrderSubscriptions).toBe(1);
});
