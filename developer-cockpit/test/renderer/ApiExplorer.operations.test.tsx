// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiExplorerView } from '../../src/renderer/views/api-explorer/ApiExplorerView';
import { useApiExplorerStore } from '../../src/renderer/stores/apiExplorer';
import { eventBus } from '../../src/renderer/lib/event-bus';
import type { HistoryEntry, TemplateSource } from '../../src/shared/apiExplorer';
import { parseHttpFile } from '../../src/shared/httpFile';
import { FakeWebSocket, mockApiExplorer, response } from './api-explorer-fixtures';

vi.mock('@monaco-editor/react', () => ({
  loader: { config: () => {} },
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="Request body" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const body = () => (screen.getByLabelText('Request body') as HTMLTextAreaElement).value;
const typeBody = (text: string) => fireEvent.change(screen.getByLabelText('Request body'), { target: { value: text } });
const url = () => (screen.getByLabelText('URL') as HTMLInputElement).value;
const sendButton = () => screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;

describe('API Explorer', () => {
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

  it('lists the operations per API and reports a spec that could not be read', async () => {
    mockApiExplorer();
    render(<ApiExplorerView />);
    const shop = await screen.findByRole('region', { name: 'Shop operations' });
    expect(within(shop).getAllByRole('button').map((b) => b.textContent)).toEqual(['POST/commands', 'GET/baskets/{basketId}']);
    expect(screen.getByText('broken.yml: bad indentation')).toBeTruthy();
  });

  it('a polymorphic operation fills the body of its first variant and switches variants', async () => {
    mockApiExplorer();
    render(<ApiExplorerView />);
    fireEvent.click(await screen.findByRole('button', { name: /POST\s*\/commands/ }));

    expect(url()).toBe('http://localhost:8000/v1/commands');
    expect(JSON.parse(body())).toEqual({ kind: 'AddItem', sku: '<sku>', quantity: 0 });
    expect(screen.getByText('No findings')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Body variant'), { target: { value: 'Checkout' } });
    expect(JSON.parse(body())).toEqual({ kind: 'Checkout', basketId: '' });
  });

  it('send stays enabled with findings and is disabled for invalid JSON', async () => {
    const api = mockApiExplorer();
    render(<ApiExplorerView />);
    fireEvent.click(await screen.findByRole('button', { name: /POST\s*\/commands/ }));

    typeBody('{"kind":"AddItem","sku":"","quantity":"1"}');
    const findings = screen.getByRole('list', { name: 'Findings' });
    expect(within(findings).getByText('quantity — expected integer, got string')).toBeTruthy();
    expect(sendButton().disabled).toBe(false);

    typeBody('{"kind": ');
    expect(screen.getByText(/Invalid JSON at line 1/)).toBeTruthy();
    expect(sendButton().disabled).toBe(true);

    typeBody('{"kind":"AddItem","sku":"lamp","quantity":1}');
    fireEvent.click(sendButton());
    await waitFor(() => expect(api.send).toHaveBeenCalledTimes(1));
    expect(api.send.mock.calls[0][0]).toMatchObject({ method: 'POST', url: 'http://localhost:8000/v1/commands', body: '{"kind":"AddItem","sku":"lamp","quantity":1}', label: 'Shop · execute' });
    expect(api.send.mock.calls[0][1]).toBeUndefined();
    expect(await screen.findByText('201')).toBeTruthy();
    await waitFor(() => expect(api.history).toHaveBeenCalledTimes(2));
  });

  it('path and query parameters build the URL; a GET has no body editor', async () => {
    const api = mockApiExplorer();
    api.send.mockResolvedValueOnce(response({ status: 404, ok: false, body: { title: 'Not Found', detail: 'No basket B 1' }, contentType: 'application/problem+json' }));
    render(<ApiExplorerView />);
    fireEvent.click(await screen.findByRole('button', { name: /GET\s*\/baskets/ }));

    expect(url()).toBe('http://localhost:8000/v1/baskets/{basketId}');
    expect(screen.queryByLabelText('Request body')).toBeNull();
    fireEvent.change(screen.getByLabelText(/basketId/), { target: { value: 'B 1' } });
    fireEvent.change(screen.getByLabelText(/verbose/), { target: { value: 'true' } });
    expect(url()).toBe('http://localhost:8000/v1/baskets/B%201?verbose=true');

    fireEvent.click(sendButton());
    expect(await screen.findByText('Not Found: No basket B 1')).toBeTruthy();
    expect(api.send.mock.calls[0][0]).toMatchObject({ method: 'GET', url: 'http://localhost:8000/v1/baskets/B%201?verbose=true' });
  });

  it('a changing request to a non-local host asks first and sends the confirmed host', async () => {
    const api = mockApiExplorer();
    render(<ApiExplorerView />);
    await screen.findByRole('button', { name: /POST\s*\/commands/ });
    fireEvent.change(screen.getByLabelText('Method'), { target: { value: 'DELETE' } });
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'https://shop.example.test/baskets/1' } });

    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    fireEvent.click(sendButton());
    expect(confirm).toHaveBeenCalledWith('Send this DELETE request to shop.example.test? It is not a local service.');
    expect(api.send).not.toHaveBeenCalled();

    fireEvent.click(sendButton());
    await waitFor(() => expect(api.send).toHaveBeenCalledTimes(1));
    expect(api.send.mock.calls[0][1]).toBe('shop.example.test');
  });

  it('a template fills the editor and its variables resolve on send; an unresolved one blocks', async () => {
    const file = parseHttpFile('@base = http://localhost:8000/v1\n\n###\n# @name Add a lamp\nPOST {{base}}/commands\n\n{"kind":"AddItem","sku":"{{sku}}","id":"{{$guid}}"}\n');
    const templates: TemplateSource[] = [{ path: 'requests/shop.http', file }];
    const api = mockApiExplorer({ templates });
    render(<ApiExplorerView />);
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Templates' }));
    fireEvent.click(await screen.findByRole('button', { name: /Add a lamp/ }));

    expect(url()).toBe('{{base}}/commands');
    expect(screen.getByText('{{sku}} — unresolved variable')).toBeTruthy();
    expect(sendButton().disabled).toBe(true);

    typeBody('{"kind":"AddItem","sku":"lamp","id":"{{$guid}}"}');
    fireEvent.click(sendButton());
    await waitFor(() => expect(api.send).toHaveBeenCalledTimes(1));
    const sent = api.send.mock.calls[0][0];
    expect(sent.url).toBe('http://localhost:8000/v1/commands');
    expect(JSON.parse(sent.body!).id).toMatch(/^[0-9a-f-]{36}$/);
    expect(sent.label).toBe('Add a lamp');
  });

  it('a history entry can be restored into the editor', async () => {
    const history: HistoryEntry[] = [
      { id: 'h1', at: '2026-11-25T10:00:00Z', label: 'Shop · execute', method: 'POST', path: '/v1/commands', url: 'http://localhost:8000/v1/commands', status: 201, durationMs: 9, request: { body: '{"kind":"Checkout"}', truncated: true, headers: { 'X-Trace': 'abc' } } },
    ];
    mockApiExplorer({ history });
    render(<ApiExplorerView />);
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'History' }));
    fireEvent.click(await screen.findByRole('button', { name: /Restore Shop · execute/ }));

    expect(url()).toBe('http://localhost:8000/v1/commands');
    expect(body()).toBe('{"kind":"Checkout"}');
    expect((screen.getByLabelText('Headers') as HTMLTextAreaElement).value).toBe('X-Trace: abc');
    expect(screen.getByText(/stored truncated/)).toBeTruthy();
  });

  it('an empty catalog says where APIs are configured', async () => {
    mockApiExplorer({ catalog: { apis: [] } });
    render(<ApiExplorerView />);
    expect((await screen.findByTestId('no-apis')).textContent).toContain('apiExplorer.apis');
  });

  it('saves the request as a template, writing undeclared file variables as values', async () => {
    const file = parseHttpFile('@base = http://localhost:8000/v1\n\n###\n# @name Add\nPOST {{base}}/commands\n\n{"kind":"AddItem"}\n');
    const other = parseHttpFile('GET http://x/\n');
    const api = mockApiExplorer({ templates: [{ path: 'requests/shop.http', file }, { path: 'requests/other.http', file: other }] });
    render(<ApiExplorerView />);
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Templates' }));
    fireEvent.click(await screen.findByRole('button', { name: /Add/ }));

    fireEvent.click(screen.getByRole('button', { name: /Save as template/ }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Copy' } });
    fireEvent.change(screen.getByLabelText('Save to'), { target: { value: 'requests/other.http' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.saveTemplate).toHaveBeenCalledTimes(1));
    expect(api.saveTemplate.mock.calls[0][0]).toEqual({ path: 'requests/other.http', name: 'Copy', method: 'POST', url: 'http://localhost:8000/v1/commands', body: '{"kind":"AddItem"}' });
  });
});
