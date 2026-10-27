// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiExplorerView } from '../../src/renderer/views/api-explorer/ApiExplorerView';
import { useApiExplorerStore } from '../../src/renderer/stores/apiExplorer';
import { followUp, mockApiExplorer } from './api-explorer-fixtures';

vi.mock('@monaco-editor/react', () => ({
  loader: { config: () => {} },
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="Command body" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const body = () => (screen.getByLabelText('Command body') as HTMLTextAreaElement).value;

async function createOrder() {
  fireEvent.click(await screen.findByRole('button', { name: 'OrderCreateCmd' }));
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  return screen.findByRole('region', { name: 'Order follow-up' });
}

describe('API Explorer: order follow-up', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useApiExplorerStore.setState(useApiExplorerStore.getInitialState(), true);
  });

  it('shows state and timeline after a create, and refresh reloads', async () => {
    const api = mockApiExplorer();
    render(<ApiExplorerView />);
    const panel = await createOrder();

    await waitFor(() => expect(api.followUp).toHaveBeenCalledWith('O-1'));
    expect(within(panel).getByRole('heading', { name: /Order O-1/ })).toBeTruthy();
    expect(within(panel).getByText('UNACK', { selector: '[data-field="state"]' })).toBeTruthy();
    const timeline = within(panel).getByRole('table', { name: 'Event timeline' });
    const rows = within(timeline).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell').slice(0, 3).map((c) => c.textContent))).toEqual([['1', 'NEW_ORDER', 'UNACK']]);

    // The transaction and snapshot are behind a toggle.
    expect(within(panel).queryByText(/"type": "OrderCreateCmd"/)).toBeNull();
    fireEvent.click(within(rows[0]).getByRole('button', { name: 'Details' }));
    expect(within(panel).getByText(/"type": "OrderCreateCmd"/)).toBeTruthy();

    api.followUp.mockResolvedValueOnce(
      followUp({
        order: { orderId: 'O-1', state: 'LIVE' },
        events: [
          ...followUp().events!,
          { version: 2, event: 'ACCEPT', resultingState: 'LIVE', timeStamp: null, transaction: {}, orderSnapshot: {} },
        ],
      }),
    );
    fireEvent.click(within(panel).getByRole('button', { name: 'Refresh' }));
    await within(panel).findByText('LIVE', { selector: '[data-field="state"]' });
    expect(within(within(panel).getByRole('table', { name: 'Event timeline' })).getAllByRole('button', { name: 'Details' })).toHaveLength(2);
    expect(api.followUp).toHaveBeenCalledTimes(2);
  });

  it('shows a not-found message and no timeline for an unknown order', async () => {
    const api = mockApiExplorer();
    api.followUp.mockResolvedValue(followUp({ order: null, events: [] }));
    render(<ApiExplorerView />);
    const panel = await createOrder();
    expect(await within(panel).findByText('Order O-1 not found')).toBeTruthy();
    expect(within(panel).queryByRole('table', { name: 'Event timeline' })).toBeNull();
  });

  it('shows raw events and errors when the event log has an unexpected shape', async () => {
    const api = mockApiExplorer();
    api.followUp.mockResolvedValue(followUp({ events: null, rawEvents: { odd: 'shape' }, error: 'events: HTTP 500' }));
    render(<ApiExplorerView />);
    const panel = await createOrder();
    expect(await within(panel).findByText(/"odd": "shape"/)).toBeTruthy();
    expect(within(panel).getByRole('alert').textContent).toContain('events: HTTP 500');
  });

  it('a failed order query shows its error, not "not found"', async () => {
    const api = mockApiExplorer();
    api.followUp.mockResolvedValue(followUp({ order: null, orderError: 'HTTP 500', events: [], error: 'order: HTTP 500' }));
    render(<ApiExplorerView />);
    const panel = await createOrder();
    expect((await within(panel).findByRole('alert')).textContent).toContain('order: HTTP 500');
    expect(within(panel).queryByText(/not found/)).toBeNull();
  });

  it('next command presets orderId', async () => {
    mockApiExplorer();
    render(<ApiExplorerView />);
    const panel = await createOrder();
    await within(panel).findByRole('table', { name: 'Event timeline' });

    const next = within(panel).getByLabelText('Next command') as HTMLSelectElement;
    const options = [...next.options].map((o) => o.value).filter(Boolean);
    // Every command that names an order is offered, including ExecutionCreateCmd (execution.orderId).
    expect(options).toEqual(expect.arrayContaining(['OrderAcceptCmd', 'ExecutionCreateCmd', 'OrderCancelRequestCmd']));
    expect(options).not.toContain('OrderCreateCmd');

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.change(next, { target: { value: 'OrderAcceptCmd' } });
    expect(JSON.parse(body())).toEqual({ type: 'OrderAcceptCmd', version: '1.0.0', orderId: 'O-1' });
    fireEvent.change(within(screen.getByRole('region', { name: 'Order follow-up' })).getByLabelText('Next command'), {
      target: { value: 'ExecutionCreateCmd' },
    });
    expect(JSON.parse(body()).execution.orderId).toBe('O-1');
  });

  it('does not follow up a failed create', async () => {
    const api = mockApiExplorer();
    api.sendCommand.mockResolvedValue({ ok: false, status: 400, durationMs: 1, body: { id: '', status: 'FAILED' }, contentType: 'application/json', url: '' });
    render(<ApiExplorerView />);
    fireEvent.click(await screen.findByRole('button', { name: 'OrderCreateCmd' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('400');
    expect(api.followUp).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: 'Order follow-up' })).toBeNull();
  });

  it('Use as template fills an OrderCreateCmd body from the order', async () => {
    const api = mockApiExplorer();
    api.followUp.mockResolvedValue(
      followUp({
        order: {
          id: 7, orderId: 'O-1', rootOrderId: 'O-1', txNr: 2, state: 'LIVE', cancelState: null, cumQty: 0, leavesQty: 500,
          sessionId: 's-1', clOrdId: 'old', sendingTime: '2026-10-27T05:44:00Z', account: 'account-01',
          ordType: 'LIMIT', price: 86.96, side: 'BUY', symbol: 'INTC', orderQty: 500,
        },
      }),
    );
    render(<ApiExplorerView />);
    const panel = await createOrder();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    fireEvent.click(await within(panel).findByRole('button', { name: 'Use as template' }));
    const b = JSON.parse(body());
    expect(b.type).toBe('OrderCreateCmd');
    expect(b.order).toEqual({
      sessionId: 's-1', clOrdId: '{{$guid}}', sendingTime: '{{$datetime iso8601}}', account: 'account-01',
      ordType: 'LIMIT', price: 86.96, side: 'BUY', symbol: 'INTC', orderQty: 500,
    });
    expect(screen.getByText('No findings')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'OrderCreateCmd' }).getAttribute('aria-current')).toBe('true');
    expect(confirm).not.toHaveBeenCalled(); // the body was not edited

    // an edited body is only replaced after confirming
    fireEvent.change(screen.getByLabelText('Command body'), { target: { value: '{}' } });
    confirm.mockReturnValue(false);
    fireEvent.click(within(panel).getByRole('button', { name: 'Use as template' }));
    expect(body()).toBe('{}');
  });
});
