// SPEC-0075: the Outbox tab - what waits to be published, and in which state.
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import OutboxView from './OutboxView';

const mockSummary = jest.fn();
const mockMessages = jest.fn();
const mockMessage = jest.fn();

jest.mock('../services/OMSApiService', () => ({
  OMSApiService: {
    getInstance: async () => ({
      getOutboxSummary: (...args: any[]) => mockSummary(...args),
      getOutboxMessages: (...args: any[]) => mockMessages(...args),
      getOutboxMessage: (...args: any[]) => mockMessage(...args),
    }),
  },
}));

const stuck = {
  id: 7, state: 'STUCK', aggregateType: 'ORDER', topic: 'oms_orders', key: 'ORD-1', orderId: 'ORD-1',
  aggregateVersion: 3, createdAt: '2026-11-25T08:00:00Z', attempts: 10, maxAttempts: 10,
  lastError: 'RecordTooLargeException: the message is too big',
};
const held = { ...stuck, id: 8, state: 'HELD', attempts: 0, aggregateVersion: 4, lastError: null };
const page = (content: any[], totalPages = 1, number = 0) => ({
  content, page: { size: 50, totalElements: content.length, totalPages, number },
});

beforeEach(() => {
  mockSummary.mockReset().mockResolvedValue({
    pending: 4, stuck: 1, held: 1, maxAttempts: 10, oldestWaitingCreatedAt: '2026-11-25T08:00:00Z', oldestWaitingAgeSeconds: 3900,
  });
  mockMessages.mockReset().mockResolvedValue(page([stuck, held]));
  mockMessage.mockReset();
});

const tile = (label: string) => screen.getByRole('group', { name: label });
const rows = () => screen.getAllByRole('row').filter((r) => r.classList.contains('outbox-row'));

describe('OutboxView (SPEC-0075)', () => {
  it('shows the summary: pending, stuck, held and the oldest waiting age (AC-1)', async () => {
    render(<OutboxView />);

    await waitFor(() => expect(within(tile('Stuck')).getByText('1')).toBeInTheDocument());
    expect(within(tile('Pending')).getByText('4')).toBeInTheDocument();
    expect(within(tile('Held')).getByText('1')).toBeInTheDocument();
    expect(within(tile('Oldest waiting')).getByText('1 h 5 min')).toBeInTheDocument();
    // the terms explained, with the configured attempts
    expect(screen.getByText(/used up its 10 attempts/)).toBeInTheDocument();
    expect(screen.getByText(/waits behind a stuck message/)).toBeInTheDocument();
  });

  it('lists messages with state, attempts and last error (AC-2)', async () => {
    render(<OutboxView />);

    await waitFor(() => expect(rows()).toHaveLength(2));
    const first = within(rows()[0]);
    expect(first.getByText('STUCK')).toBeInTheDocument();
    expect(first.getByText('oms_orders')).toBeInTheDocument();
    expect(first.getByText('ORD-1', { selector: '.outbox-key' })).toBeInTheDocument();
    expect(first.getByText('10 / 10')).toBeInTheDocument();
    expect(first.getByText('RecordTooLargeException: the message is too big')).toBeInTheDocument();
    expect(within(rows()[1]).getByText('HELD')).toBeInTheDocument();
    expect(mockMessages).toHaveBeenCalledWith(undefined, 0, 50);
  });

  it('shows the execution and the message type of a projection message (AC-2)', async () => {
    mockMessages.mockResolvedValue(page([{
      ...stuck, id: 9, aggregateType: 'PROJECTION', execId: 'EX-9', payloadType: 'org.example.common.model.msg.OrderExecution',
    }]));
    render(<OutboxView />);

    await waitFor(() => expect(rows()).toHaveLength(1));
    const row = within(rows()[0]);
    expect(row.getByText('EX-9')).toBeInTheDocument();
    expect(row.getByText('OrderExecution')).toBeInTheDocument();
    expect(row.getByText('OrderExecution').getAttribute('title')).toBe('PROJECTION: org.example.common.model.msg.OrderExecution');
  });

  it('explains that the pending gauge counts every waiting message', async () => {
    render(<OutboxView />);

    expect(await screen.findByText(/oms\.outbox\.pending/)).toBeInTheDocument();
  });

  it('shows the message opened last, whatever order the answers come in', async () => {
    let answerFirst: (value: any) => void = () => undefined;
    mockMessage.mockImplementation((id: number) => (id === 7
      ? new Promise((resolve) => { answerFirst = resolve; })
      : Promise.resolve({ ...held, payload: null })));
    render(<OutboxView />);
    await waitFor(() => expect(rows()).toHaveLength(2));

    fireEvent.click(screen.getByRole('button', { name: 'Open message 7' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open message 8' }));
    expect(await screen.findByRole('region', { name: 'Outbox message 8' })).toBeInTheDocument();
    answerFirst({ ...stuck, payload: { late: true } });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByRole('region', { name: 'Outbox message 8' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Outbox message 7' })).toBeNull();
  });

  it('filters by state (AC-3)', async () => {
    render(<OutboxView />);
    await waitFor(() => expect(rows()).toHaveLength(2));

    mockMessages.mockResolvedValue(page([stuck]));
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'STUCK' } });

    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(mockMessages).toHaveBeenLastCalledWith('STUCK', 0, 50);
  });

  it('pages through the messages (AC-3)', async () => {
    mockMessages.mockResolvedValue(page([stuck], 3, 0));
    render(<OutboxView />);
    await waitFor(() => expect(screen.getByText('Page 1 of 3')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();

    mockMessages.mockResolvedValue(page([held], 3, 1));
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));

    await waitFor(() => expect(screen.getByText('Page 2 of 3')).toBeInTheDocument());
    expect(mockMessages).toHaveBeenLastCalledWith(undefined, 1, 50);
  });

  it('says that an empty outbox has published everything (AC-4)', async () => {
    mockSummary.mockResolvedValue({ pending: 0, stuck: 0, held: 0, maxAttempts: 10 });
    mockMessages.mockResolvedValue(page([]));
    render(<OutboxView />);

    expect(await screen.findByText('Outbox is empty: every message has been published')).toBeInTheDocument();
    expect(within(tile('Pending')).getByText('0')).toBeInTheDocument();
    expect(within(tile('Oldest waiting')).getByText('—')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('opens a message with its payload as a JSON tree (AC-5)', async () => {
    mockMessage.mockResolvedValue({
      ...stuck, aggregateType: 'PROJECTION', payloadType: 'org.example.common.model.msg.OrderExecution',
      payload: { execId: 'EX-1', lastPx: 101.5 }, payloadSchemaId: 12,
    });
    render(<OutboxView />);
    await waitFor(() => expect(rows()).toHaveLength(2));

    fireEvent.click(screen.getByRole('button', { name: 'Open message 7' }));

    const detail = await screen.findByRole('region', { name: 'Outbox message 7' });
    expect(mockMessage).toHaveBeenCalledWith(7);
    expect(await within(detail).findByText('org.example.common.model.msg.OrderExecution')).toBeInTheDocument();
    expect(within(detail).getByText('RecordTooLargeException: the message is too big')).toBeInTheDocument();
    // the payload opens expanded at its root: its fields are visible at once
    expect(within(detail).getByRole('button', { name: /Payload/ }).getAttribute('aria-expanded')).toBe('true');
    expect(within(detail).getByText('"EX-1"')).toBeInTheDocument();
  });

  it('shows what a pointer message points to (AC-5)', async () => {
    mockMessage.mockResolvedValue({ ...held, payload: null });
    render(<OutboxView />);
    await waitFor(() => expect(rows()).toHaveLength(2));

    fireEvent.click(screen.getByRole('button', { name: 'Open message 8' }));

    const detail = await screen.findByRole('region', { name: 'Outbox message 8' });
    expect(await within(detail).findByText(/built at publish time from order ORD-1, version 4/)).toBeInTheDocument();
    expect(within(detail).queryByRole('button', { name: /Payload/ })).toBeNull();
  });

  it('says so when a message was published meanwhile', async () => {
    mockMessage.mockRejectedValue(Object.assign(new Error('Request failed with status code 404'), { response: { status: 404 } }));
    render(<OutboxView />);
    await waitFor(() => expect(rows()).toHaveLength(2));

    fireEvent.click(screen.getByRole('button', { name: 'Open message 7' }));

    expect(await screen.findByText('Message 7 is no longer in the outbox: it was published meanwhile.')).toBeInTheDocument();
  });

  it('shows an error with retry and recovers', async () => {
    mockSummary.mockRejectedValueOnce(new Error('Network Error'));
    render(<OutboxView />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Could not load the outbox: Network Error/);

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('refresh reloads the summary and the messages', async () => {
    render(<OutboxView />);
    await waitFor(() => expect(rows()).toHaveLength(2));

    fireEvent.click(screen.getByRole('button', { name: 'Refresh outbox' }));

    await waitFor(() => expect(mockSummary).toHaveBeenCalledTimes(2));
    expect(mockMessages).toHaveBeenCalledTimes(2);
  });
});
