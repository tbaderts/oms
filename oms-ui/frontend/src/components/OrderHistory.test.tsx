// SPEC-0074: the order History view - the event log and command log as one readable timeline.
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import OrderHistory from './OrderHistory';
import { formatNumber, formatPrice } from '../services/fieldFormat';
import { dateTimeService } from '../services/DateTimeService';

const mockGetOrderEvents = jest.fn();
const mockGetOrderCommands = jest.fn();

jest.mock('../services/OMSApiService', () => ({
  OMSApiService: {
    getInstance: async () => ({
      getOrderEvents: (...args: any[]) => mockGetOrderEvents(...args),
      getOrderCommands: (...args: any[]) => mockGetOrderCommands(...args),
    }),
  },
}));

const events = [
  {
    orderId: 'ORD-1', version: 1, event: 'NEW_ORDER', resultingState: 'UNACK', timeStamp: '2026-11-25T09:00:00Z',
    source: 'REST', principal: 'trader-1', commandId: 'C-1',
    transaction: { type: 'OrderCreateCmd', order: { symbol: 'AAPL', price: 170.5 } },
    orderSnapshot: { orderId: 'ORD-1', state: 'UNACK', price: 170.5 },
    changes: { price: { from: null, to: 170.5 }, orderQty: { from: null, to: 1000 } }, // the backend writes from: null (OrderChanges)
  },
  {
    orderId: 'ORD-1', version: 2, event: 'REPLACE', resultingState: 'LIVE', timeStamp: '2026-11-25T09:05:00Z',
    source: 'KAFKA', principal: 'trader-2', commandId: 'C-2',
    transaction: { type: 'OrderReplaceRequestCmd' },
    orderSnapshot: { orderId: 'ORD-1', state: 'LIVE', price: 171.25 },
    changes: {
      price: { from: 170.5, to: 171.25 },
      transactTime: { from: '2026-11-25T09:00:00Z', to: '2026-11-25T09:05:00Z' },
      text: { from: 'urgent', to: null },
    },
  },
];

const commands = [
  { commandId: 'C-1', type: 'OrderCreateCmd', receivedAt: '2026-11-25T09:00:00Z', outcome: 'APPLIED', eventVersion: 1, source: 'REST' },
  { commandId: 'C-X', type: 'OrderCancelRequestCmd', receivedAt: '2026-11-25T09:02:00Z', outcome: 'REFUSED', reason: 'order is not cancellable', source: 'REST', principal: 'trader-3' },
  { commandId: 'C-2', type: 'OrderReplaceRequestCmd', receivedAt: '2026-11-25T09:05:00Z', outcome: 'APPLIED', eventVersion: 2, source: 'KAFKA' },
];

const entries = () => screen.getAllByRole('listitem').filter((li) => li.classList.contains('history-entry'));

beforeEach(() => {
  mockGetOrderEvents.mockReset().mockResolvedValue(events);
  mockGetOrderCommands.mockReset().mockResolvedValue(commands);
});

describe('OrderHistory (SPEC-0074)', () => {
  it('lists events oldest first with their metadata (AC-1)', async () => {
    render(<OrderHistory orderId="ORD-1" />);

    await waitFor(() => expect(entries().length).toBeGreaterThan(0));
    expect(mockGetOrderEvents).toHaveBeenCalledWith('ORD-1');
    expect(mockGetOrderCommands).toHaveBeenCalledWith('ORD-1');

    const eventEntries = entries().filter((li) => li.classList.contains('history-entry--event'));
    expect(eventEntries).toHaveLength(2);
    const [first, second] = eventEntries.map((li) => within(li));
    expect(first.getByText('v1')).toBeInTheDocument();
    expect(first.getByText('NEW_ORDER')).toBeInTheDocument();
    expect(first.getByText('UNACK')).toBeInTheDocument();
    expect(first.getByText(dateTimeService.formatForDisplay('2026-11-25T09:00:00Z'))).toBeInTheDocument();
    expect(first.getByText('REST')).toBeInTheDocument();
    expect(first.getByText('trader-1')).toBeInTheDocument();
    expect(second.getByText('v2')).toBeInTheDocument();
    expect(second.getByText('REPLACE')).toBeInTheDocument();
    expect(second.getByText('LIVE')).toBeInTheDocument();
    expect(second.getByText('KAFKA')).toBeInTheDocument();
    expect(second.getByText('trader-2')).toBeInTheDocument();
  });

  it('shows the causing command on its event, not as an entry of its own (AC-2)', async () => {
    render(<OrderHistory orderId="ORD-1" />);
    await waitFor(() => expect(entries().length).toBeGreaterThan(0));

    expect(entries()).toHaveLength(3); // two events and the refused command
    const v1 = within(entries()[0]);
    expect(v1.getByText('OrderCreateCmd')).toBeInTheDocument();
    expect(v1.getByText('APPLIED')).toBeInTheDocument();
    const v2 = within(entries()[2]);
    expect(v2.getByText('OrderReplaceRequestCmd')).toBeInTheDocument();
  });

  it('shows a refused command as its own entry, in time order (AC-3)', async () => {
    render(<OrderHistory orderId="ORD-1" />);
    await waitFor(() => expect(entries().length).toBeGreaterThan(0));

    const refused = entries()[1];
    expect(refused.classList.contains('history-entry--refused')).toBe(true);
    expect(refused.classList.contains('history-entry--event')).toBe(false);
    const r = within(refused);
    expect(r.getByText('OrderCancelRequestCmd')).toBeInTheDocument();
    expect(r.getByText('REFUSED')).toBeInTheDocument();
    expect(r.getByText('order is not cancellable')).toBeInTheDocument();
    expect(r.getByText('trader-3')).toBeInTheDocument();
  });

  it('lists changed fields with old and new values, formatted as in the detail panel (AC-4)', async () => {
    render(<OrderHistory orderId="ORD-1" />);
    await waitFor(() => expect(entries().length).toBeGreaterThan(0));

    const firstChanges = within(entries()[0]).getAllByRole('row').filter((r) => r.classList.contains('change-row'));
    const qty = firstChanges.find((r) => within(r).queryByText('orderQty'))!;
    expect(within(qty).getByText(formatNumber(1000))).toBeInTheDocument();
    // a first event has no old value: shown empty, never as "null"
    expect(qty.querySelector('.change-from')?.textContent).toBe('');
    expect(entries()[0].textContent).not.toMatch(/null/);

    const replace = within(entries()[2]).getAllByRole('row').filter((r) => r.classList.contains('change-row'));
    const price = replace.find((r) => within(r).queryByText('price'))!;
    expect(price.querySelector('.change-from')?.textContent).toBe(formatPrice(170.5));
    expect(price.querySelector('.change-to')?.textContent).toBe(formatPrice(171.25));

    // timestamps as in the detail panel
    const transact = replace.find((r) => within(r).queryByText('transactTime'))!;
    expect(transact.querySelector('.change-from')?.textContent).toBe(dateTimeService.formatForDisplay('2026-11-25T09:00:00Z'));
    expect(transact.querySelector('.change-to')?.textContent).toBe(dateTimeService.formatForDisplay('2026-11-25T09:05:00Z'));

    // a field cleared by the change shows the detail panel's empty value, not nothing
    const text = replace.find((r) => within(r).queryByText('text'))!;
    expect(text.querySelector('.change-to')?.textContent).toBe('—');
  });

  it('offers the causing command and the order snapshot as JSON trees (AC-5)', async () => {
    render(<OrderHistory orderId="ORD-1" />);
    await waitFor(() => expect(entries().length).toBeGreaterThan(0));

    const v1 = within(entries()[0]);
    expect(v1.getByRole('button', { name: /Command/ }).getAttribute('aria-expanded')).toBe('false');
    expect(v1.getByRole('button', { name: /Order snapshot/ }).getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(v1.getByRole('button', { name: /Command/ }));
    expect(v1.getByText('"OrderCreateCmd"')).toBeInTheDocument();
  });

  it('shows an error with retry and recovers (AC-6)', async () => {
    mockGetOrderEvents.mockRejectedValueOnce(new Error('Request failed with status code 500'));
    render(<OrderHistory orderId="ORD-1" />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Could not load the history/);
    expect(alert.textContent).toMatch(/500/);

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(entries()).toHaveLength(3));
    expect(mockGetOrderEvents).toHaveBeenCalledTimes(2);
    expect(mockGetOrderCommands).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows an error when the command log request fails, network error included (AC-6)', async () => {
    mockGetOrderCommands.mockRejectedValueOnce(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }));
    render(<OrderHistory orderId="ORD-1" />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Could not load the history: Network Error/);
    expect(screen.queryByRole('list')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(entries()).toHaveLength(3));
  });

  it('shows an empty state for an order without history (AC-7)', async () => {
    mockGetOrderEvents.mockResolvedValue([]);
    mockGetOrderCommands.mockResolvedValue([]);
    render(<OrderHistory orderId="ORD-1" />);

    expect(await screen.findByText('No history recorded for this order')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('refresh fetches the history again (AC-8)', async () => {
    render(<OrderHistory orderId="ORD-1" />);
    await waitFor(() => expect(entries()).toHaveLength(3));

    let release: () => void = () => undefined;
    mockGetOrderEvents.mockReturnValue(new Promise((resolve) => { release = () => resolve([events[0]]); }));
    mockGetOrderCommands.mockResolvedValue([commands[0]]);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh history' }));

    // while refreshing, the current history stays in view
    expect(entries()).toHaveLength(3);
    release();

    await waitFor(() => expect(entries()).toHaveLength(1));
    expect(mockGetOrderEvents).toHaveBeenCalledTimes(2);
    expect(mockGetOrderCommands).toHaveBeenCalledTimes(2);
  });
});
