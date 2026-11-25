import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';

// SPEC-0075: the Outbox and Dead letters tabs. The blotters are stubbed; the views are real, over a
// mocked API, so the tabs' loading on demand and their independence are exercised end to end.

jest.mock('./components/OrderBlotter', () => () => <div>REST orders</div>);
jest.mock('./components/ExecutionBlotter', () => () => <div>REST executions</div>);
jest.mock('./components/StreamingOrderBlotter', () => () => <div>Live orders</div>);
jest.mock('./components/StreamingExecutionBlotter', () => () => <div>Live executions</div>);
jest.mock('./components/OrderEntry', () => () => <div>Order entry</div>);
jest.mock('./services/ConfigService', () => ({
  ConfigService: {
    getConfig: async () => ({ appName: 'OMS' }),
    getFeatureFlags: () => ({ quotesEnabled: false, quoteRequestsEnabled: false, streamingEnabled: true }),
  },
  DEFAULT_FEATURE_FLAGS: { quotesEnabled: false, quoteRequestsEnabled: false, streamingEnabled: true },
}));

const mockSummary = jest.fn();
const mockMessages = jest.fn();
const mockTopics = jest.fn();
const mockRecords = jest.fn();

jest.mock('./services/OMSApiService', () => ({
  OMSApiService: {
    getInstance: async () => ({
      getOutboxSummary: (...args: any[]) => mockSummary(...args),
      getOutboxMessages: (...args: any[]) => mockMessages(...args),
      getOutboxMessage: jest.fn(),
      getDeadLetterTopics: (...args: any[]) => mockTopics(...args),
      getDeadLetterRecords: (...args: any[]) => mockRecords(...args),
    }),
  },
}));

beforeEach(() => {
  mockSummary.mockReset().mockResolvedValue({ pending: 0, stuck: 1, held: 0, maxAttempts: 10 });
  mockMessages.mockReset().mockResolvedValue({
    content: [{ id: 7, state: 'STUCK', aggregateType: 'ORDER', topic: 'oms_orders', key: 'ORD-1', orderId: 'ORD-1',
      createdAt: '2026-11-25T08:00:00Z', attempts: 10, maxAttempts: 10, lastError: 'too big' }],
    page: { size: 50, totalElements: 1, totalPages: 1, number: 0 },
  });
  mockTopics.mockReset().mockRejectedValue(Object.assign(new Error('Request failed with status code 503'), {
    response: { status: 503, data: { detail: 'Kafka unreachable' } },
  }));
  mockRecords.mockReset();
});

describe('App operations tabs (SPEC-0075)', () => {
  it('loads each view only when its tab is opened', async () => {
    render(<App />);

    expect(screen.getByRole('button', { name: 'Outbox' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dead letters' })).toBeInTheDocument();
    expect(mockSummary).not.toHaveBeenCalled();
    expect(mockTopics).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Outbox' }));

    expect(screen.getByRole('button', { name: 'Outbox' })).toHaveClass('active');
    await waitFor(() => expect(mockSummary).toHaveBeenCalledTimes(1));
    expect(mockTopics).not.toHaveBeenCalled();
  });

  it('keeps the Outbox tab working while the dead letters fail (AC-9)', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Dead letters' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Kafka unreachable/);

    fireEvent.click(screen.getByRole('button', { name: 'Outbox' }));
    expect(await screen.findByRole('button', { name: 'Open message 7' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Outbox' })).toBeVisible();

    // back again: the dead-letter view stayed mounted, and was not fetched again
    fireEvent.click(screen.getByRole('button', { name: 'Dead letters' }));
    expect(screen.getByRole('region', { name: 'Dead letters' })).toBeVisible();
    expect(mockTopics).toHaveBeenCalledTimes(1);
  });
});
