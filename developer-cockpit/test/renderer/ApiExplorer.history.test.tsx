// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiExplorerView } from '../../src/renderer/views/api-explorer/ApiExplorerView';
import { useApiExplorerStore } from '../../src/renderer/stores/apiExplorer';
import type { HistoryEntry } from '../../src/shared/apiExplorer';
import { mockApiExplorer } from './api-explorer-fixtures';

vi.mock('@monaco-editor/react', () => ({
  loader: { config: () => {} },
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="Command body" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const HISTORY: HistoryEntry[] = [
  {
    id: 'h3',
    at: '2026-10-27T10:03:00.000Z',
    kind: 'command',
    label: 'OrderCancelRequestCmd',
    method: 'POST',
    path: '/api/command/execute',
    status: null,
    durationMs: 2,
    request: { body: '{"type":"OrderCancelRequestCmd","orderId":"O-5"}' },
  },
  {
    id: 'h2',
    at: '2026-10-27T10:02:00.000Z',
    kind: 'query',
    label: 'search',
    method: 'GET',
    path: '/api/query/search?symbol=AAPL&page=0&size=20',
    status: 200,
    durationMs: 8,
    request: { params: [{ field: 'symbol', op: 'eq', value: 'AAPL' }], page: 0, size: 20 },
  },
  {
    id: 'h1',
    at: '2026-10-27T10:01:00.000Z',
    kind: 'command',
    label: 'OrderAcceptCmd',
    method: 'POST',
    path: '/api/command/execute',
    status: 201,
    durationMs: 30,
    request: { body: '{"type":"OrderAcceptCmd","orderId":"O-4"}', truncated: true },
  },
];

async function openHistory() {
  render(<ApiExplorerView />);
  await screen.findByRole('button', { name: 'OrderCreateCmd' });
  useApiExplorerStore.getState().setTab('history');
  return screen.findByRole('list', { name: 'Request history' });
}

describe('API Explorer: History', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useApiExplorerStore.setState(useApiExplorerStore.getInitialState(), true);
  });

  it('lists entries newest first with label, request and status', async () => {
    mockApiExplorer({ history: HISTORY });
    const list = await openHistory();
    const items = within(list).getAllByRole('listitem');
    expect(items.map((i) => i.getAttribute('data-id'))).toEqual(['h3', 'h2', 'h1']);
    expect(within(items[0]).getByText('OrderCancelRequestCmd')).toBeTruthy();
    expect(within(items[0]).getByText('unreachable')).toBeTruthy();
    expect(within(items[1]).getByText('GET /api/query/search?symbol=AAPL&page=0&size=20')).toBeTruthy();
    expect(within(items[2]).getByText('201')).toBeTruthy();
    expect(within(items[2]).getByText('POST /api/command/execute')).toBeTruthy();
    for (const [i, h] of HISTORY.entries()) expect(within(items[i]).getByText(new Date(h.at).toLocaleString())).toBeTruthy();
  });

  it('marks a send refused before it left the cockpit', async () => {
    mockApiExplorer({ history: [{ ...HISTORY[0], refused: true }] });
    const list = await openHistory();
    const item = within(list).getAllByRole('listitem')[0];
    expect(within(item).getByText('refused')).toBeTruthy();
    expect(within(item).queryByText('unreachable')).toBeNull();
  });

  it('restore puts back the command body', async () => {
    mockApiExplorer({ history: HISTORY });
    const list = await openHistory();
    fireEvent.click(within(list).getAllByRole('button', { name: /Restore/ })[2]);
    expect(useApiExplorerStore.getState().tab).toBe('commands');
    expect((await screen.findByLabelText('Command body') as HTMLTextAreaElement).value).toBe('{"type":"OrderAcceptCmd","orderId":"O-4"}');
    expect(screen.getByRole('button', { name: 'OrderAcceptCmd' }).getAttribute('aria-current')).toBe('true');
    expect(screen.getByText(/truncated when it was stored/)).toBeTruthy();
  });

  it('restore puts back the query filters', async () => {
    mockApiExplorer({ history: HISTORY });
    const list = await openHistory();
    fireEvent.click(within(list).getAllByRole('button', { name: /Restore/ })[1]);
    expect(useApiExplorerStore.getState().tab).toBe('orders');
    expect((await screen.findByLabelText('Field 1') as HTMLSelectElement).value).toBe('symbol');
    expect((screen.getByLabelText('Value 1') as HTMLInputElement).value).toBe('AAPL');
    expect((screen.getByLabelText('Size') as HTMLInputElement).value).toBe('20');
  });

  it('a send or search refreshes the history', async () => {
    const api = mockApiExplorer();
    render(<ApiExplorerView />);
    fireEvent.click(await screen.findByRole('button', { name: 'OrderAcceptCmd' }));
    await waitFor(() => expect(api.history).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(api.history).toHaveBeenCalledTimes(2));
    await useApiExplorerStore.getState().search();
    expect(api.history).toHaveBeenCalledTimes(3);
  });

  it('clear asks first', async () => {
    const api = mockApiExplorer({ history: HISTORY });
    await openHistory();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: 'Clear history' }));
    expect(api.clearHistory).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    api.history.mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: 'Clear history' }));
    expect(await screen.findByText('No requests sent yet.')).toBeTruthy();
    expect(api.clearHistory).toHaveBeenCalledTimes(1);
  });
});
