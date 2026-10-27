// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiExplorerView } from '../../src/renderer/views/api-explorer/ApiExplorerView';
import { useApiExplorerStore } from '../../src/renderer/stores/apiExplorer';
import { FILTER_FIELDS, toSearchParams, type Paging, type QueryParam } from '../../src/shared/apiExplorer';
import { CATALOG, mockApiExplorer, response, followUp } from './api-explorer-fixtures';

vi.mock('@monaco-editor/react', () => ({ loader: { config: () => {} }, default: () => <textarea aria-label="Command body" /> }));

const ORDERS = [
  { orderId: 'O-1', clOrdId: 'c1', symbol: 'AAPL', side: 'BUY', orderQty: 100, cumQty: 0, state: 'LIVE', transactTime: '2026-10-27T10:00:00Z' },
  { orderId: 'O-2', clOrdId: 'c2', symbol: 'AAPL', side: 'SELL', orderQty: 50, cumQty: 50, state: 'FILLED', transactTime: '2026-10-27T10:01:00Z' },
];

/** A search mock that answers like main: the URL it reports is the one built from the arguments. */
function answeringSearch(api: ReturnType<typeof mockApiExplorer>) {
  api.search.mockImplementation(async (params: QueryParam[], paging: Paging) => {
    const qs = toSearchParams(params, paging).toString();
    return response({
      url: `http://localhost:8090/api/query/search${qs ? `?${qs}` : ''}`,
      body: { content: ORDERS, page: { number: paging.page ?? 0, size: paging.size ?? 50, totalElements: 120, totalPages: 3 } },
    });
  });
}

async function openOrders() {
  render(<ApiExplorerView />);
  await screen.findByRole('button', { name: 'OrderCreateCmd' });
  useApiExplorerStore.getState().setTab('orders');
  return screen.findByRole('region', { name: 'Order search' });
}

const select = (label: string) => screen.getByLabelText(label) as HTMLSelectElement;
const optionValues = (el: HTMLSelectElement) => [...el.options].map((o) => o.value);

describe('API Explorer: Orders', () => {
  afterEach(() => {
    cleanup();
    useApiExplorerStore.setState(useApiExplorerStore.getInitialState(), true);
  });

  it('field and operator choices by kind, enum values from the catalog', async () => {
    mockApiExplorer();
    await openOrders();
    fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));

    expect(optionValues(select('Field 1'))).toEqual(FILTER_FIELDS.map((f) => f.field));
    expect(optionValues(select('Operator 1'))).toEqual(['eq', 'like']); // orderId, a string field

    fireEvent.change(select('Field 1'), { target: { value: 'price' } });
    expect(optionValues(select('Operator 1'))).toEqual(['eq', 'gt', 'gte', 'lt', 'lte', 'between']);
    fireEvent.change(select('Operator 1'), { target: { value: 'between' } });
    expect(screen.getByLabelText('From 1')).toBeTruthy();
    expect(screen.getByLabelText('To 1')).toBeTruthy();

    fireEvent.change(select('Field 1'), { target: { value: 'state' } });
    expect(optionValues(select('Operator 1'))).toEqual(['eq']);
    expect(optionValues(select('Value 1')).filter(Boolean)).toEqual(CATALOG.schemas['enum:State'].enum);
  });

  it('URL shown equals URL sent, results table and paging, row opens follow-up', async () => {
    const api = mockApiExplorer();
    answeringSearch(api);
    const region = await openOrders();

    fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));
    fireEvent.change(select('Field 1'), { target: { value: 'symbol' } });
    fireEvent.change(screen.getByLabelText('Value 1'), { target: { value: 'AAPL' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));
    fireEvent.change(select('Field 2'), { target: { value: 'price' } });
    fireEvent.change(select('Operator 2'), { target: { value: 'between' } });
    fireEvent.change(screen.getByLabelText('From 2'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('To 2'), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText('Size'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'transactTime,DESC' } });

    const shown = within(region).getByLabelText('Request URL').textContent;
    expect(shown).toBe('http://localhost:8090/api/query/search?symbol=AAPL&price__between=100%2C200&page=0&size=20&sort=transactTime%2CDESC');

    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(api.search).toHaveBeenCalledTimes(1));
    const sent = await api.search.mock.results[0].value;
    expect(sent.url).toBe(shown);

    const table = await screen.findByRole('table', { name: 'Orders' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual(['O-1', 'O-2']);
    expect(screen.getByText('Page 1 of 3 · 120 orders')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(api.search).toHaveBeenCalledTimes(2));
    expect(api.search.mock.calls[1][1]).toEqual({ page: 1, size: 20, sort: 'transactTime,DESC' });
    await screen.findByText('Page 2 of 3 · 120 orders');

    // After paging, editing the query shows (and Search sends) the first page again.
    expect(within(region).getByLabelText('Request URL').textContent).toContain('page=1');
    fireEvent.change(screen.getByLabelText('Value 1'), { target: { value: 'MSFT' } });
    expect(within(region).getByLabelText('Request URL').textContent).toContain('symbol=MSFT&price__between=100%2C200&page=0&');
    for (const change of [() => fireEvent.change(screen.getByLabelText('Size'), { target: { value: '25' } }), () => fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'price' } })]) {
      useApiExplorerStore.setState({ page: 2 });
      change();
      expect(useApiExplorerStore.getState().page).toBe(0);
    }
    useApiExplorerStore.setState({ page: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Remove filter 2' }));
    expect(useApiExplorerStore.getState().page).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(api.search).toHaveBeenCalledTimes(3));
    expect((await api.search.mock.results[2].value).url).toBe(within(region).getByLabelText('Request URL').textContent);

    api.followUp.mockResolvedValue(followUp({ orderId: 'O-2', order: { orderId: 'O-2', state: 'LIVE', symbol: 'MSFT' } }));
    fireEvent.click(within(screen.getByRole('table', { name: 'Orders' })).getByText('O-2'));
    await waitFor(() => expect(api.followUp).toHaveBeenCalledWith('O-2'));
    expect(within(screen.getByRole('region', { name: 'Order follow-up' })).getByRole('heading', { name: 'Order O-2' })).toBeTruthy();
    // the Orders tab's follow-up offers Use as template too (SPEC-0008)
    expect(await within(screen.getByRole('region', { name: 'Order follow-up' })).findByRole('button', { name: 'Use as template' })).toBeTruthy();
  });

  it('removes a filter and shows search errors', async () => {
    const api = mockApiExplorer();
    api.search.mockResolvedValue(response({ ok: false, status: null, body: null, error: 'oms-core not reachable at http://localhost:8090: fetch failed (ECONNREFUSED)' }));
    const region = await openOrders();
    fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove filter 1' }));
    expect(screen.queryByLabelText('Field 1')).toBeNull();
    expect(within(region).getByLabelText('Request URL').textContent).toBe('http://localhost:8090/api/query/search?page=0&size=50');

    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/not reachable/);
    expect(screen.queryByRole('table', { name: 'Orders' })).toBeNull();
  });
});
