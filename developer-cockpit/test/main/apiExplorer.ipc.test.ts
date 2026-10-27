import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { IpcMain } from 'electron';
import { registerApiExplorerIpc } from '../../src/main/ipc/apiExplorer.ipc';
import { ConfigService } from '../../src/main/services/ConfigService';
import type { ApiResponse, CommandCatalog, HistoryEntry, OrderFollowUp, TemplateSource } from '../../src/shared/apiExplorer';
import { REPO_ROOT } from '../fixtures/workspace';

function fakeIpcMain() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const ipcMain = { handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn) };
  const invoke = (channel: string, ...args: unknown[]) => handlers.get(channel)!({}, ...args);
  return { ipcMain: ipcMain as unknown as IpcMain, invoke, channels: () => [...handlers.keys()] };
}

function recordingFetch() {
  const urls: string[] = [];
  const impl = (async (input: string | URL) => {
    urls.push(String(input));
    const p = new URL(String(input)).pathname;
    const body = p.startsWith('/api/order-events') ? [] : p.endsWith('/search') ? { content: [] } : { id: 'O-1', status: 'OK' };
    return new Response(JSON.stringify(body), { status: p.endsWith('/execute') ? 201 : 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return { impl, urls };
}

describe('API Explorer IPC', () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

  async function setup(omsCoreUrl?: string) {
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-cfg-'));
    dirs.push(configDir);
    const configService = new ConfigService(configDir);
    const config = await configService.load();
    await configService.save({
      ...config,
      general: { ...config.general, workspaceRoot: REPO_ROOT },
      infrastructure: { ...config.infrastructure, ...(omsCoreUrl !== undefined ? { omsCoreUrl } : {}) },
    });
    const f = recordingFetch();
    const ipc = fakeIpcMain();
    registerApiExplorerIpc(ipc.ipcMain, configService, { fetch: f.impl, log: () => {} });
    return { ...ipc, configService, configDir, urls: f.urls };
  }

  it('registers the explorer channels', async () => {
    const { channels } = await setup();
    expect(channels().sort()).toEqual(
      ['catalog', 'baseUrl', 'sendCommand', 'search', 'followUp', 'history', 'clearHistory', 'templates', 'saveTemplate'].map((c) => `apiExplorer:${c}`).sort(),
    );
  });

  it('defaults to http://localhost:8090', async () => {
    const { invoke, configService, urls } = await setup();
    expect(configService.getConfig().infrastructure.omsCoreUrl).toBe('http://localhost:8090');
    expect(await invoke('apiExplorer:baseUrl')).toEqual({ baseUrl: 'http://localhost:8090', local: true });
    await invoke('apiExplorer:sendCommand', '{"type":"OrderAcceptCmd","orderId":"X"}');
    expect(urls).toEqual(['http://localhost:8090/api/command/execute']);
  });

  it('falls back to the default when the saved URL is empty', async () => {
    const { invoke } = await setup('  ');
    expect(await invoke('apiExplorer:baseUrl')).toEqual({ baseUrl: 'http://localhost:8090', local: true });
  });

  it('uses the new base URL after config save without re-registering', async () => {
    const { invoke, configService, urls } = await setup();
    const current = configService.getConfig();
    await configService.save({ ...current, infrastructure: { ...current.infrastructure, omsCoreUrl: 'http://127.0.0.1:9999' } });
    await invoke('apiExplorer:search', [], { page: 0 });
    expect(urls).toEqual(['http://127.0.0.1:9999/api/query/search?page=0']);
    expect(await invoke('apiExplorer:baseUrl')).toEqual({ baseUrl: 'http://127.0.0.1:9999', local: true });
  });

  it('serves the catalog from the configured contracts', async () => {
    const { invoke } = await setup();
    const catalog = (await invoke('apiExplorer:catalog')) as CommandCatalog;
    expect(catalog.commandTypes).toContain('OrderCreateCmd');
  });

  it('records each send including failures, not follow-ups', async () => {
    const { invoke, configDir, configService } = await setup();
    const sent = (await invoke('apiExplorer:sendCommand', '{"type":"OrderAcceptCmd","orderId":"X"}')) as ApiResponse;
    expect(sent.status).toBe(201);
    await invoke('apiExplorer:search', [{ field: 'symbol', op: 'eq', value: 'AAPL' }], { size: 10 });
    await invoke('apiExplorer:sendCommand', '{"type":'); // refused before sending: still recorded
    const followUp = (await invoke('apiExplorer:followUp', 'X')) as OrderFollowUp;
    expect(followUp.orderId).toBe('X');

    const history = (await invoke('apiExplorer:history')) as HistoryEntry[];
    expect(history.map((h) => [h.kind, h.label, h.method, h.path, h.status, Boolean(h.refused)])).toEqual([
      ['command', '(invalid JSON)', 'POST', '/api/command/execute', null, true],
      ['query', 'search', 'GET', '/api/query/search?symbol=AAPL&size=10', 200, false],
      ['command', 'OrderAcceptCmd', 'POST', '/api/command/execute', 201, false],
    ]);
    expect(history[1].request).toEqual({ params: [{ field: 'symbol', op: 'eq', value: 'AAPL' }], size: 10 });
    expect(history[2].request).toEqual({ body: '{"type":"OrderAcceptCmd","orderId":"X"}' });
    expect(fs.existsSync(path.join(configDir, 'api-explorer-history.json'))).toBe(true);
    expect(configService.getConfigDir()).toBe(configDir);

    await invoke('apiExplorer:clearHistory');
    expect(await invoke('apiExplorer:history')).toEqual([]);
  });

  it('returns the response when the history cannot be written', async () => {
    const { invoke, configDir } = await setup();
    // A directory where the history file belongs makes every write fail.
    fs.mkdirSync(path.join(configDir, 'api-explorer-history.json'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sent = (await invoke('apiExplorer:sendCommand', '{"type":"OrderAcceptCmd","orderId":"X"}')) as ApiResponse;
    expect(sent.status).toBe(201);
    const found = (await invoke('apiExplorer:search', [], {})) as ApiResponse;
    expect(found.status).toBe(200);
    expect(warn.mock.calls.some((c) => String(c[0]).includes('[api-explorer] history not written'))).toBe(true);
    warn.mockRestore();
  });

  it('templates and saveTemplate channels', async () => {
    const { invoke, configService } = await setup('http://oms:9000');
    const repo = (await invoke('apiExplorer:templates')) as TemplateSource[];
    expect(repo.map((s) => s.path)).toEqual(expect.arrayContaining(['developer-cockpit/api-templates/orders.http', 'developer-cockpit/api-templates/lifecycle.http']));

    // a scratch workspace, so saving does not touch the repository
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-ws-'));
    dirs.push(root);
    fs.writeFileSync(path.join(root, 'extra.http'), 'GET http://h/x\n');
    const config = configService.getConfig();
    await configService.save({
      ...config,
      general: { ...config.general, workspaceRoot: root },
      infrastructure: { ...config.infrastructure, apiTemplateSources: ['extra.http', 'gone.http'] },
    });
    expect(((await invoke('apiExplorer:templates')) as TemplateSource[]).map((s) => [s.path, Boolean(s.missing)])).toEqual([
      ['extra.http', false],
      ['gone.http', true],
    ]);
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    expect(await invoke('apiExplorer:saveTemplate', { newFile: 'new.http', name: 'N', body: '{}' })).toEqual({ ok: true, path: 'developer-cockpit/api-templates/new.http' });
    expect(fs.readFileSync(path.join(root, 'developer-cockpit', 'api-templates', 'new.http'), 'utf8')).toMatch(/^@baseUrl = http:\/\/oms:9000\n/);
    expect(await invoke('apiExplorer:saveTemplate', { path: 'extra.http', name: 'E', body: '{}' })).toEqual({ ok: true, path: 'extra.http' });
    expect(await invoke('apiExplorer:saveTemplate', { path: 'C:/elsewhere.http', name: 'E', body: '{}' })).toEqual({ ok: false, error: 'Not a template source: C:/elsewhere.http' });
    expect(await invoke('apiExplorer:saveTemplate', null)).toEqual({ ok: false, error: 'Invalid save request' });
    info.mockRestore();
  });
});
