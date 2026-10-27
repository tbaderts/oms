// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiExplorerView } from '../../src/renderer/views/api-explorer/ApiExplorerView';
import { useApiExplorerStore } from '../../src/renderer/stores/apiExplorer';
import { eventBus } from '../../src/renderer/lib/event-bus';
import { CATALOG, FakeWebSocket, mockApiExplorer, response } from './api-explorer-fixtures';

vi.mock('@monaco-editor/react', () => ({
  loader: { config: () => {} },
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="Command body" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const body = () => (screen.getByLabelText('Command body') as HTMLTextAreaElement).value;
const typeBody = (text: string) => fireEvent.change(screen.getByLabelText('Command body'), { target: { value: text } });
const sendButton = () => screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;

describe('API Explorer: Commands', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    eventBus.connect('ws://test');
  });
  afterEach(() => {
    cleanup();
    eventBus.disconnect();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    useApiExplorerStore.setState(useApiExplorerStore.getInitialState(), true);
  });

  it('lists the command types and fills the editor with a template', async () => {
    mockApiExplorer();
    render(<ApiExplorerView />);
    const list = await screen.findByRole('list', { name: 'Command types' });
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual(CATALOG.commandTypes);
    expect(screen.getByText('oms-core: http://localhost:8090')).toBeTruthy();
    expect(screen.queryByText('non-local')).toBeNull();

    fireEvent.click(within(list).getByRole('button', { name: 'OrderAcceptCmd' }));
    expect(JSON.parse(body())).toEqual({ type: 'OrderAcceptCmd', version: '1.0.0', orderId: '<orderId>' });
    expect(screen.getByText('No findings')).toBeTruthy();
  });

  it('send stays enabled with findings and is disabled for invalid JSON', async () => {
    mockApiExplorer();
    render(<ApiExplorerView />);
    fireEvent.click(await screen.findByRole('button', { name: 'OrderCreateCmd' }));

    const template = JSON.parse(body());
    typeBody(JSON.stringify({ ...template, order: { ...template.order, side: 'SIDEWAYS', orderQty: '1' } }, null, 2));
    const findings = screen.getByRole('list', { name: 'Findings' });
    expect(within(findings).getByText(/order\.side/)).toBeTruthy();
    expect(within(findings).getByText(/order\.orderQty — expected number, got string/)).toBeTruthy();
    expect(sendButton().disabled).toBe(false);

    typeBody('{"type": ');
    expect(screen.getByText(/Invalid JSON at line 1/)).toBeTruthy();
    expect(sendButton().disabled).toBe(true);
  });

  it('asks before replacing an edited body', async () => {
    mockApiExplorer();
    render(<ApiExplorerView />);
    fireEvent.click(await screen.findByRole('button', { name: 'OrderAcceptCmd' }));
    typeBody('{"type":"OrderAcceptCmd","orderId":"MINE"}');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: 'OrderCancelCmd' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(body()).toBe('{"type":"OrderAcceptCmd","orderId":"MINE"}');
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'OrderCancelCmd' }));
    expect(JSON.parse(body()).type).toBe('OrderCancelCmd');
  });

  it('shows status, duration and body; shows the unreachable alert', async () => {
    const api = mockApiExplorer();
    render(<ApiExplorerView />);
    fireEvent.click(await screen.findByRole('button', { name: 'OrderAcceptCmd' }));
    typeBody('{"type":"OrderAcceptCmd","orderId":"O-7"}');
    api.sendCommand.mockResolvedValueOnce(response({ ok: false, status: 400, durationMs: 34, body: { status: 'FAILED', message: 'Order not found' } }));
    fireEvent.click(sendButton());

    const panel = await screen.findByRole('region', { name: 'Response' });
    await within(panel).findByText('400');
    expect(within(panel).getByText('34 ms')).toBeTruthy();
    expect(within(panel).getByText(/Order not found/)).toBeTruthy();
    expect(api.sendCommand).toHaveBeenCalledWith('{"type":"OrderAcceptCmd","orderId":"O-7"}', undefined);

    api.sendCommand.mockResolvedValueOnce(
      response({ ok: false, status: null, durationMs: 3, body: null, error: 'oms-core not reachable at http://localhost:8090: fetch failed (ECONNREFUSED)' }),
    );
    fireEvent.click(sendButton());
    expect((await within(panel).findByRole('alert')).textContent).toMatch(/oms-core not reachable at http:\/\/localhost:8090.*ECONNREFUSED/);
    // The view stays usable.
    typeBody('{"type":"OrderAcceptCmd","orderId":"O-8"}');
    expect(sendButton().disabled).toBe(false);
  });

  it('shows the title and detail of a problem response', async () => {
    const api = mockApiExplorer();
    render(<ApiExplorerView />);
    fireEvent.click(await screen.findByRole('button', { name: 'OrderAcceptCmd' }));
    api.sendCommand.mockResolvedValueOnce(
      response({ ok: false, status: 400, contentType: 'application/problem+json', body: { title: 'Bad Request', detail: 'orderId must not be blank' } }),
    );
    fireEvent.click(sendButton());
    const panel = await screen.findByRole('region', { name: 'Response' });
    expect(await within(panel).findByText('Bad Request: orderId must not be blank')).toBeTruthy();
  });

  it('asks before sending to a non-local host; cancel sends nothing', async () => {
    const api = mockApiExplorer({ baseUrl: 'https://oms-test.example', local: false });
    render(<ApiExplorerView />);
    fireEvent.click(await screen.findByRole('button', { name: 'OrderAcceptCmd' }));
    expect(screen.getByText('non-local')).toBeTruthy();

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(sendButton());
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('oms-test.example'));
    expect(api.sendCommand).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(sendButton());
    await waitFor(() => expect(api.sendCommand).toHaveBeenCalledWith(expect.any(String), 'oms-test.example'));
  });

  it('reloads the command list when a contract file changes', async () => {
    const api = mockApiExplorer();
    render(<ApiExplorerView />);
    await screen.findByRole('button', { name: 'OrderCreateCmd' });
    api.catalog.mockResolvedValue({ ...CATALOG, commandTypes: [...CATALOG.commandTypes, 'OrderReplaceCmd'], schemas: { ...CATALOG.schemas, OrderReplaceCmd: CATALOG.schemas.OrderAcceptCmd } });

    const event = (path: string) =>
      FakeWebSocket.last!.onmessage!({ data: JSON.stringify({ type: 'file:changed', timestamp: Date.now(), payload: { path, kind: 'change' } }) });
    event('C:\\ws\\oms-core\\src\\main\\java\\Foo.java');
    event('C:\\ws\\oms-contracts\\src\\main\\openapi\\oms-cmd-api.yml');

    expect(await screen.findByRole('button', { name: 'OrderReplaceCmd' }, { timeout: 2000 })).toBeTruthy();
    expect(api.catalog).toHaveBeenCalledTimes(2);
  });

  it('shows a catalog error', async () => {
    const api = mockApiExplorer();
    api.catalog.mockResolvedValue({ commandTypes: [], schemas: {}, error: 'oms-cmd-api.yml not found in x' });
    render(<ApiExplorerView />);
    expect((await screen.findByText(/oms-cmd-api\.yml not found in x/)).closest('[role="alert"]')).toBeTruthy();
  });
});
