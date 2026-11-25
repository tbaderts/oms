import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { IpcMain } from 'electron';
import { registerApiExplorerIpc } from '../../src/main/ipc/apiExplorer.ipc';
import { ConfigService } from '../../src/main/services/ConfigService';
import type { ApiCatalog, ApiResponse, HistoryEntry, TemplateSource } from '../../src/shared/apiExplorer';

function fakeIpcMain() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const ipcMain = { handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn) };
  const invoke = (channel: string, ...args: unknown[]) => handlers.get(channel)!({}, ...args);
  return { ipcMain: ipcMain as unknown as IpcMain, invoke, channels: () => [...handlers.keys()] };
}

const SPEC = `
openapi: 3.0.3
info: { title: Shop, version: 1.0.0 }
paths:
  /baskets:
    post:
      operationId: createBasket
      requestBody: { content: { application/json: { schema: { type: object, properties: { owner: { type: string } } } } } }
`;

describe('API Explorer IPC', () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

  async function setup() {
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-cfg-'));
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-ws-'));
    dirs.push(configDir, ws);
    fs.mkdirSync(path.join(ws, 'api'));
    fs.writeFileSync(path.join(ws, 'api', 'shop.yml'), SPEC);
    fs.writeFileSync(path.join(ws, 'api', 'shop.http'), '@base = http://localhost:8000\n\n###\n# @name Create\nPOST {{base}}/baskets\n\n{}\n');
    fs.writeFileSync(
      path.join(ws, 'cockpit.yaml'),
      'apiExplorer:\n  templateSources: [api/shop.http]\n  apis:\n    - { name: Shop, spec: api/shop.yml, baseUrl: "http://localhost:8000" }\n',
    );
    const configService = new ConfigService(configDir);
    const config = await configService.load();
    await configService.save({ ...config, general: { ...config.general, workspaceRoot: ws } });
    const urls: string[] = [];
    const fetchImpl = (async (input: string | URL) => {
      urls.push(String(input));
      return new Response('{"id":"B-1"}', { status: 201, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;
    const ipc = fakeIpcMain();
    registerApiExplorerIpc(ipc.ipcMain, configService, { fetch: fetchImpl, log: () => {} });
    return { ...ipc, ws, urls };
  }

  it('registers the explorer channels', async () => {
    const { channels } = await setup();
    expect(channels().sort()).toEqual(['catalog', 'send', 'history', 'clearHistory', 'templates', 'saveTemplate'].map((c) => `apiExplorer:${c}`).sort());
  });

  it('lists the operations of the APIs in cockpit.yaml', async () => {
    const { invoke } = await setup();
    const catalog = (await invoke('apiExplorer:catalog')) as ApiCatalog;
    expect(catalog.apis.map((a) => [a.name, a.operations.map((o) => o.id)])).toEqual([['Shop', ['createBasket']]]);
  });

  it('sends a request and records it in the history', async () => {
    const { invoke, urls } = await setup();
    const r = (await invoke('apiExplorer:send', { method: 'POST', url: 'http://localhost:8000/baskets', body: '{"owner":"ann"}', label: 'Shop · createBasket' })) as ApiResponse;
    expect(r).toMatchObject({ ok: true, status: 201, body: { id: 'B-1' } });
    expect(urls).toEqual(['http://localhost:8000/baskets']);

    const history = (await invoke('apiExplorer:history')) as HistoryEntry[];
    expect(history[0]).toMatchObject({ label: 'Shop · createBasket', method: 'POST', path: '/baskets', url: 'http://localhost:8000/baskets', status: 201, request: { body: '{"owner":"ann"}' } });

    await invoke('apiExplorer:clearHistory');
    expect(await invoke('apiExplorer:history')).toEqual([]);
  });

  it('a refused request is recorded as refused and never sent', async () => {
    const { invoke, urls } = await setup();
    const r = (await invoke('apiExplorer:send', { method: 'POST', url: 'https://shop.example.test/baskets', body: '{}' })) as ApiResponse;
    expect(r.refused).toBe(true);
    expect(urls).toEqual([]);
    expect(((await invoke('apiExplorer:history')) as HistoryEntry[])[0]).toMatchObject({ label: 'POST /baskets', refused: true, status: null });
    const confirmed = (await invoke('apiExplorer:send', { method: 'POST', url: 'https://shop.example.test/baskets', body: '{}' }, 'shop.example.test')) as ApiResponse;
    expect(confirmed.ok).toBe(true);
  });

  it('lists and saves templates in the configured files', async () => {
    const { invoke, ws } = await setup();
    const sources = (await invoke('apiExplorer:templates')) as TemplateSource[];
    expect(sources.map((s) => [s.path, s.file?.requests.map((r) => r.name)])).toEqual([['api/shop.http', ['Create']]]);

    expect(await invoke('apiExplorer:saveTemplate', { path: 'api/shop.http', name: 'Second', method: 'post', url: '{{base}}/baskets', body: '{"owner":"bo"}' })).toEqual({
      ok: true,
      path: 'api/shop.http',
    });
    expect(fs.readFileSync(path.join(ws, 'api', 'shop.http'), 'utf8')).toContain('# @name Second\nPOST {{base}}/baskets HTTP/1.1\ncontent-type: application/json\n\n{"owner":"bo"}\n');
    expect(await invoke('apiExplorer:saveTemplate', { newFile: 'more.http', name: 'Third', method: 'GET', url: 'http://localhost:8000/baskets', body: '' })).toEqual({
      ok: true,
      path: 'api/more.http',
    });
    expect(await invoke('apiExplorer:saveTemplate', { path: 'api/shop.http', name: 'Bad' })).toEqual({ ok: false, error: 'Invalid save request' });
  });
});

describe('API Explorer history redaction (SPEC-0076 review)', () => {
  it('stores credential headers without their values', async () => {
    const { redactHeaders, REDACTED } = await import('../../src/main/ipc/apiExplorer.ipc');
    expect(redactHeaders({ Authorization: 'Bearer abc', Cookie: 'sid=1', 'X-Api-Key': 'k', 'X-Session-Token': 't', 'X-Trace': 'keep' })).toEqual({
      Authorization: REDACTED,
      Cookie: REDACTED,
      'X-Api-Key': REDACTED,
      'X-Session-Token': REDACTED,
      'X-Trace': 'keep',
    });
  });
});
