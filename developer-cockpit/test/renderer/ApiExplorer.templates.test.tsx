// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiExplorerView } from '../../src/renderer/views/api-explorer/ApiExplorerView';
import { useApiExplorerStore } from '../../src/renderer/stores/apiExplorer';
import { eventBus } from '../../src/renderer/lib/event-bus';
import { parseHttpFile } from '../../src/shared/httpFile';
import type { TemplateSource } from '../../src/shared/apiExplorer';
import { FakeWebSocket, mockApiExplorer } from './api-explorer-fixtures';

vi.mock('@monaco-editor/react', () => ({
  loader: { config: () => {} },
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="Command body" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const ORDERS = [
  '@account = account-01',
  '###',
  '# @name INTC buy',
  'POST {{baseUrl}}/api/command/execute',
  '',
  '{"type":"OrderCreateCmd","order":{"clOrdId":"{{$guid}}","sendingTime":"{{$datetime iso8601}}","account":"{{account}}","ordType":"LIMIT","side":"BUY","symbol":"INTC","orderQty":500,"price":86.96}}',
  '###',
  '# @name Accept',
  'POST {{baseUrl}}/api/command/execute',
  '',
  '{"type":"OrderAcceptCmd","orderId":"{{orderId}}"}',
  '###',
  '# @name Broken',
  'POST {{baseUrl}}/api/command/execute',
  '',
  '{"type": ',
].join('\n');

const sources = (text = ORDERS): TemplateSource[] => [
  { path: 'developer-cockpit/api-templates/orders.http', shared: true, file: parseHttpFile(text) },
  { path: 'oms-core/gone.http', shared: false, missing: true },
];

const body = () => (screen.getByLabelText('Command body') as HTMLTextAreaElement).value;
const sendButton = () => screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;
const template = async (name: string) => fireEvent.click(await screen.findByRole('button', { name }));

describe('API Explorer: templates', () => {
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

  it('lists templates under their command type and loads one', async () => {
    mockApiExplorer({ templates: sources() });
    render(<ApiExplorerView />);
    const create = await screen.findByRole('list', { name: 'Templates for OrderCreateCmd' });
    expect(within(create).getAllByRole('button').map((b) => b.textContent)).toEqual(['INTC buy']);
    expect(within(screen.getByRole('list', { name: 'Templates for OrderAcceptCmd' })).getByRole('button', { name: 'Accept' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'INTC buy' }).getAttribute('title')).toBe('developer-cockpit/api-templates/orders.http, line 4');

    const files = screen.getByRole('list', { name: 'Template problems' });
    expect(within(files).getByText(/Broken/).closest('li')!.textContent).toMatch(/invalid JSON/);
    expect(within(files).getByText(/oms-core\/gone\.http/).closest('li')!.textContent).toMatch(/missing/);

    await template('INTC buy');
    expect(body()).toContain('"clOrdId":"{{$guid}}"');
    expect(screen.getByText('No findings')).toBeTruthy();
    expect(sendButton().disabled).toBe(false);
  });

  it('reloads templates on a .http file event', async () => {
    const api = mockApiExplorer({ templates: sources() });
    render(<ApiExplorerView />);
    await screen.findByRole('button', { name: 'INTC buy' });
    api.templates.mockResolvedValue(sources(`${ORDERS}\n###\n# @name AAPL sell\nPOST {{baseUrl}}/api/command/execute\n\n{"type":"OrderCreateCmd","order":{}}`));

    FakeWebSocket.last!.onmessage!({
      data: JSON.stringify({ type: 'file:changed', timestamp: Date.now(), payload: { path: 'C:\\ws\\oms-core\\rest.http', kind: 'change' } }),
    });
    expect(await screen.findByRole('button', { name: 'AAPL sell' }, { timeout: 2000 })).toBeTruthy();
    expect(api.templates).toHaveBeenCalledTimes(2);
  });

  it('sends the resolved body with fresh values each time', async () => {
    const api = mockApiExplorer({ templates: sources() });
    render(<ApiExplorerView />);
    await template('INTC buy');
    fireEvent.click(sendButton());
    await waitFor(() => expect(api.sendCommand).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(sendButton().disabled).toBe(false));
    fireEvent.click(sendButton());
    await waitFor(() => expect(api.sendCommand).toHaveBeenCalledTimes(2));

    const sent = api.sendCommand.mock.calls.map((c) => JSON.parse(c[0]).order);
    for (const o of sent) {
      expect(o.clOrdId).toMatch(/^[0-9a-f-]{36}$/);
      expect(Date.now() - Date.parse(o.sendingTime)).toBeLessThan(10_000);
      expect(o.account).toBe('account-01');
    }
    expect(sent[0].clOrdId).not.toBe(sent[1].clOrdId);
    expect(body()).toContain('{{$guid}}'); // the editor keeps the template

    // the create opened the follow-up of O-1, so {{orderId}} now resolves to it
    await template('Accept');
    await waitFor(() => expect(sendButton().disabled).toBe(false));
    fireEvent.click(sendButton());
    await waitFor(() => expect(api.sendCommand).toHaveBeenCalledTimes(3));
    expect(JSON.parse(api.sendCommand.mock.calls[2][0])).toEqual({ type: 'OrderAcceptCmd', orderId: 'O-1' });
  });

  it('does not send a body with unresolved variables', async () => {
    const api = mockApiExplorer({ templates: sources() });
    render(<ApiExplorerView />);
    await template('Accept');
    const findings = screen.getByRole('list', { name: 'Findings' });
    expect(within(findings).getByText('{{orderId}} — unresolved variable')).toBeTruthy();
    expect(sendButton().disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Command body'), { target: { value: '{"type":"OrderAcceptCmd","orderId":"{{nope}}"}' } });
    expect(within(screen.getByRole('list', { name: 'Findings' })).getByText('{{nope}} — unresolved variable')).toBeTruthy();
    await useApiExplorerStore.getState().send();
    expect(api.sendCommand).not.toHaveBeenCalled();
  });

  it('saves the editor body as a template', async () => {
    const api = mockApiExplorer({ templates: sources() });
    render(<ApiExplorerView />);
    fireEvent.click(await screen.findByRole('button', { name: 'OrderCreateCmd' }));
    const edited = { type: 'OrderCreateCmd', version: '1.0.0', order: { clOrdId: 'C-1', sendingTime: '2026-10-27T05:44:00Z', symbol: 'INTC' } };
    fireEvent.change(screen.getByLabelText('Command body'), { target: { value: JSON.stringify(edited) } });

    fireEvent.click(screen.getByRole('button', { name: 'Save as template' }));
    const dialog = await screen.findByRole('dialog');
    const save = () => within(dialog).getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    expect(save().disabled).toBe(true); // no name yet
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'My INTC' } });
    // the missing source is not offered
    const targets = within(dialog).getByLabelText('Save to') as HTMLSelectElement;
    expect([...targets.options].map((o) => o.textContent)).toEqual(['developer-cockpit/api-templates/orders.http', 'New file in api-templates…']);
    expect((within(dialog).getByRole('switch', { name: /Use variables/ }) as HTMLButtonElement).getAttribute('aria-checked')).toBe('true');

    api.saveTemplate.mockResolvedValueOnce({ ok: false, error: 'A template named "My INTC" already exists in developer-cockpit/api-templates/orders.http' });
    fireEvent.click(save());
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    expect(within(dialog).getByRole('alert').textContent).toMatch(/already exists/);
    expect(screen.getByRole('dialog')).toBeTruthy();

    fireEvent.change(targets, { target: { value: '__new__' } });
    fireEvent.change(within(dialog).getByLabelText('File name'), { target: { value: 'mine.http' } });
    fireEvent.click(save());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const [first, second] = api.saveTemplate.mock.calls.map((c) => c[0]);
    expect(first).toMatchObject({ path: 'developer-cockpit/api-templates/orders.http', name: 'My INTC' });
    expect(second).toMatchObject({ newFile: 'mine.http', name: 'My INTC' });
    expect(JSON.parse(second.body)).toEqual({ type: 'OrderCreateCmd', version: '1.0.0', order: { clOrdId: '{{$guid}}', sendingTime: '{{$datetime iso8601}}', symbol: 'INTC' } });
    expect(api.templates).toHaveBeenCalledTimes(2); // reloaded after the save

    // without variables the body is saved as it is
    fireEvent.click(screen.getByRole('button', { name: 'Save as template' }));
    const again = await screen.findByRole('dialog');
    fireEvent.change(within(again).getByLabelText('Name'), { target: { value: 'Literal' } });
    fireEvent.click(within(again).getByRole('switch', { name: /Use variables/ }));
    fireEvent.click(within(again).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.saveTemplate).toHaveBeenCalledTimes(3));
    expect(api.saveTemplate.mock.calls[2][0].body).toBe(JSON.stringify(edited));
  });

  it('saving a template elsewhere keeps it sendable: defaults to its own file, inlines undeclared file variables', async () => {
    const lifecycle: TemplateSource = {
      path: 'developer-cockpit/api-templates/a-lifecycle.http',
      shared: true,
      file: parseHttpFile('@baseUrl = http://h'),
    };
    const api = mockApiExplorer({ templates: [lifecycle, ...sources()] });
    render(<ApiExplorerView />);
    await template('INTC buy');

    fireEvent.click(screen.getByRole('button', { name: 'Save as template' }));
    const dialog = await screen.findByRole('dialog');
    expect((within(dialog).getByLabelText('Save to') as HTMLSelectElement).value).toBe('developer-cockpit/api-templates/orders.http');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Copy' } });
    fireEvent.change(within(dialog).getByLabelText('Save to'), { target: { value: 'developer-cockpit/api-templates/a-lifecycle.http' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.saveTemplate).toHaveBeenCalledTimes(1));
    const saved = JSON.parse(api.saveTemplate.mock.calls[0][0].body).order;
    expect(saved.account).toBe('account-01'); // not declared in a-lifecycle.http
    expect(saved.clOrdId).toBe('{{$guid}}');
  });

  it('resolves variables after the non-local confirmation', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-27T10:00:00Z'));
    const api = mockApiExplorer({ templates: sources(), baseUrl: 'http://oms-test.example:8090', local: false });
    render(<ApiExplorerView />);
    await template('INTC buy');
    vi.spyOn(window, 'confirm').mockImplementation(() => {
      vi.setSystemTime(new Date('2026-10-27T10:05:00Z')); // the user takes a while
      return true;
    });
    fireEvent.click(sendButton());
    await waitFor(() => expect(api.sendCommand).toHaveBeenCalledTimes(1));
    expect(JSON.parse(api.sendCommand.mock.calls[0][0]).order.sendingTime).toBe('2026-10-27T10:05:00.000Z');
    vi.useRealTimers();
  });
});
