import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import type { IpcMain } from 'electron';
import { registerStoryboardsIpc, type StoryboardsIpc } from '../../src/main/ipc/storyboards.ipc';
import { ConfigService } from '../../src/main/services/ConfigService';
import type { CockpitEvent } from '../../src/shared/types/events';
import { EXCALIDRAW_SVG, createStoryboardWorkspace, md, type StoryboardWorkspace } from '../fixtures/storyboards';

function fakeIpcMain() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const ipcMain = { handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn) };
  const invoke = (channel: string, ...args: unknown[]) => {
    const h = handlers.get(channel);
    if (!h) throw new Error(`no handler for ${channel}`);
    return h({}, ...args) as Promise<any>;
  };
  return { ipcMain: ipcMain as unknown as IpcMain, invoke, channels: () => [...handlers.keys()] };
}

describe('storyboards IPC', () => {
  let ws: StoryboardWorkspace;
  let runtime: StoryboardsIpc | undefined;
  const dirs: string[] = [];
  afterEach(() => {
    runtime?.dispose();
    ws?.cleanup();
    dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
  });

  async function setup(opts: { saveTo?: string | null; writable?: boolean } = {}) {
    ws = createStoryboardWorkspace();
    ws.writeExample();
    ws.write({ 'oms-knowledge-base/functional-requirements/FR-001-accept.md': md({ id: 'FR-001', title: 'Accept' }, '\nOrders are accepted.\n') });
    const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-cfg-'));
    dirs.push(cfgDir);
    const configService = new ConfigService(cfgDir);
    const config = await configService.load();
    await configService.save({ ...config, general: { ...config.general, workspaceRoot: ws.root }, storyboards: { ...config.storyboards, writable: opts.writable ?? true } });
    const events: CockpitEvent[] = [];
    const saved: { file: string; content: Buffer }[] = [];
    const { ipcMain, invoke, channels } = fakeIpcMain();
    runtime = registerStoryboardsIpc(ipcMain, {
      configService,
      broadcast: (e) => events.push(e),
      chooseSaveFile: async () => opts.saveTo ?? null,
      writeFile: (file, content) => saved.push({ file, content: Buffer.from(content) }),
      printToPdf: async (html) => Buffer.from(`%PDF-1.7 ${html.length}`),
      env: {},
    });
    return { invoke, channels, events, saved, configService };
  }

  it('registers every channel of the preload API', async () => {
    const { channels } = await setup();
    expect(channels().sort()).toEqual([
      'storyboards:aiAssist', 'storyboards:aiAvailable', 'storyboards:backlinks', 'storyboards:create', 'storyboards:createStep',
      'storyboards:deleteStep', 'storyboards:detail', 'storyboards:exportHtml', 'storyboards:exportMermaid', 'storyboards:exportPdf',
      'storyboards:library', 'storyboards:links', 'storyboards:readIllustration', 'storyboards:reorder', 'storyboards:saveIllustration',
      'storyboards:saveStep', 'storyboards:saveStory', 'storyboards:scan',
    ]);
  });

  it('scans and reads by id; paths and malformed ids are not found', async () => {
    const { invoke } = await setup();
    const scan = await invoke('storyboards:scan');
    expect(scan.catalogue.map((s: { id: string }) => s.id)).toEqual(['buy-gold-mobile']);
    expect(await invoke('storyboards:detail', 'buy-gold-mobile')).toMatchObject({ ok: true });
    for (const bad of [path.join(ws.root, 'oms-knowledge-base/storyboards/precious-metals/buy-gold-mobile'), '../buy-gold-mobile', 42, null, { id: 'x' }]) {
      expect(await invoke('storyboards:detail', bad)).toMatchObject({ ok: false, code: 'not-found' });
    }
  });

  it('create accepts only a rootId from the scan, never a path', async () => {
    const { invoke } = await setup();
    const { roots } = await invoke('storyboards:scan');
    const lanes = [{ id: 'oms', label: 'OMS', kind: 'system' }];
    expect(await invoke('storyboards:create', { rootId: path.join(ws.root, 'oms-knowledge-base/storyboards'), domain: 'x', title: 'T', lanes, stepTitles: ['A'] })).toMatchObject({ ok: false, code: 'invalid' });
    expect(await invoke('storyboards:create', { rootId: roots[0].rootId, domain: 'x', title: 'T', lanes, stepTitles: ['A'] })).toMatchObject({ ok: true, id: 't' });
  });

  it('passes writes through, and rejects them when read-only', async () => {
    const { invoke } = await setup({ writable: false });
    await invoke('storyboards:scan');
    const d = await invoke('storyboards:detail', 'buy-gold-mobile');
    const s = d.detail.steps[0];
    expect(await invoke('storyboards:saveStep', 'buy-gold-mobile', s.id, { title: 'x' }, s.body, s.revision)).toMatchObject({ ok: false, code: 'read-only' });
    expect(await invoke('storyboards:saveIllustration', 'buy-gold-mobile', 'x.excalidraw.svg', EXCALIDRAW_SVG)).toMatchObject({ ok: false, code: 'read-only' });
  });

  it('reads an editable illustration back as text, and nothing else', async () => {
    const { invoke } = await setup();
    await invoke('storyboards:scan');
    expect(await invoke('storyboards:readIllustration', 'buy-gold-mobile', 'accept-quote.excalidraw.svg')).toEqual({ ok: true, svg: EXCALIDRAW_SVG });
    expect(await invoke('storyboards:readIllustration', 'buy-gold-mobile', '../story.md')).toMatchObject({ ok: false, code: 'invalid' });
    expect(await invoke('storyboards:readIllustration', 'buy-gold-mobile', 'nothere.excalidraw.svg')).toMatchObject({ ok: false, code: 'not-found' });
  });

  it('exports Mermaid and HTML, saving to the chosen file only when asked; PDF through the printer', async () => {
    const { invoke, saved } = await setup({ saveTo: path.join(os.tmpdir(), 'out.file') });
    await invoke('storyboards:scan');
    const m = await invoke('storyboards:exportMermaid', 'buy-gold-mobile', true, false);
    expect(m).toMatchObject({ ok: true, source: expect.stringContaining('opt 3a') });
    expect(saved).toEqual([]);
    const h = await invoke('storyboards:exportHtml', 'buy-gold-mobile', undefined, true);
    expect(h).toMatchObject({ ok: true, savedTo: path.join(os.tmpdir(), 'out.file') });
    expect(saved[0].content.toString()).toMatch(/^<!doctype html>/i);
    const p = await invoke('storyboards:exportPdf', 'buy-gold-mobile', undefined);
    expect(p).toMatchObject({ ok: true, savedTo: path.join(os.tmpdir(), 'out.file') });
    expect(saved[1].content.toString()).toMatch(/^%PDF/);
  });

  it('a cancelled save dialog writes nothing', async () => {
    const { invoke, saved } = await setup({ saveTo: null });
    await invoke('storyboards:scan');
    expect(await invoke('storyboards:exportPdf', 'buy-gold-mobile', undefined)).toEqual({ ok: true, savedTo: null });
    expect(saved).toEqual([]);
  });

  it('serves links and backlinks, and AI is unavailable without a key', async () => {
    const { invoke } = await setup();
    await invoke('storyboards:scan');
    expect((await invoke('storyboards:links')).requirements).toEqual(['FR-001']);
    expect(await invoke('storyboards:backlinks', 'FR-001')).toEqual([{ id: 'buy-gold-mobile', title: 'Buy gold via mobile app' }]);
    expect(await invoke('storyboards:aiAvailable')).toBe(false);
    expect(await invoke('storyboards:aiAssist', 'suggestLinks', 'buy-gold-mobile', 'route-to-market')).toMatchObject({ ok: false, code: 'invalid' });
  });

  it('turns a file-system error inside a write into { ok: false } instead of a rejected call', async () => {
    const { invoke } = await setup();
    await invoke('storyboards:scan');
    const d = await invoke('storyboards:detail', 'buy-gold-mobile');
    const s = d.detail.steps[0];
    const original = runtime!.service().saveStep.bind(runtime!.service());
    runtime!.service().saveStep = () => {
      throw Object.assign(new Error('EPERM: operation not permitted, rename'), { code: 'EPERM' });
    };
    await expect(invoke('storyboards:saveStep', 'buy-gold-mobile', s.id, { title: 'x' }, s.body, s.revision)).resolves.toMatchObject({
      ok: false,
      code: 'invalid',
      message: expect.stringContaining('EPERM'),
    });
    runtime!.service().saveStep = original;
  });

  it('reacts to config changes and watcher events', async () => {
    const { invoke, events, configService } = await setup();
    await invoke('storyboards:scan');
    const config = configService.getConfig();
    await configService.save({ ...config, storyboards: { ...config.storyboards, roots: ['nowhere'] } });
    runtime!.reconfigure(configService.getConfig());
    expect(events.map((e) => e.type)).toContain('storyboards:changed');
    expect((await invoke('storyboards:scan')).catalogue).toEqual([]);
    // a requirement edit invalidates the link index
    ws.write({ 'oms-knowledge-base/functional-requirements/FR-002-x.md': md({ id: 'FR-002', title: 'X' }) });
    runtime!.onWatcherPath(path.join(ws.root, 'oms-knowledge-base/functional-requirements/FR-002-x.md'), 'add');
    expect((await invoke('storyboards:links')).requirements).toEqual(['FR-001', 'FR-002']);
  });
});
