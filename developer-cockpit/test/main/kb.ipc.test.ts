// kb.ipc.test.ts - kb:health and kb:fixIndexes run the checker on the configured knowledge base,
// and an applied fix refreshes the explorer (SPEC-0064, AC-7 and AC-8).
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IpcMain } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { registerKbIpc } from '../../src/main/ipc/kb.ipc';
import type { ConfigService } from '../../src/main/services/ConfigService';
import type { OkfCli } from '../../src/main/services/OkfCli';

function fakeIpcMain() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const ipcMain = { handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn) };
  const invoke = async (channel: string, ...args: unknown[]) => {
    const h = handlers.get(channel);
    if (!h) throw new Error(`no handler for ${channel}`);
    return h({}, ...args);
  };
  return { ipcMain: ipcMain as unknown as IpcMain, invoke };
}

const doc = (title: string) => `---\ntitle: ${title}\n---\n# ${title}\n`;

describe('kb.ipc health tools (SPEC-0064)', () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

  function setup() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-ipc-'));
    dirs.push(root);
    const kbPath = path.join(root, 'kb');
    fs.mkdirSync(path.join(kbPath, 'domain'), { recursive: true });
    fs.writeFileSync(path.join(kbPath, 'domain', 'order.md'), doc('Order'));
    const configService = {
      getWorkspaceRoot: () => root,
      getKnowledgeBasePath: () => kbPath,
    } as unknown as ConfigService;
    const report = { concepts: 1, errors: [], warnings: [], stats: { documents: 1 } };
    const cli = {
      report: vi.fn(async () => report),
      fixIndexes: vi.fn(async (_kb: string, apply: boolean) => {
        // Stands in for the CLI writing an index: the explorer must see the new file afterwards.
        if (apply) fs.writeFileSync(path.join(kbPath, 'domain', 'index.md'), doc('Domain'));
        return { applied: apply, changes: [] };
      }),
    };
    const createCli = vi.fn(() => cli as unknown as OkfCli);
    const { ipcMain, invoke } = fakeIpcMain();
    registerKbIpc(ipcMain, configService, { createOkfCli: createCli });
    return { root, kbPath, cli, createCli, invoke, report };
  }

  it('kb:health runs the checker of the configured workspace on the configured knowledge base', async () => {
    const { root, kbPath, cli, createCli, invoke, report } = setup();
    expect(await invoke('kb:health')).toEqual(report);
    expect(createCli).toHaveBeenCalledWith(root);
    expect(cli.report).toHaveBeenCalledWith(kbPath);
  });

  it('kb:fixIndexes previews without rescanning, and applies with a rescan', async () => {
    const { kbPath, cli, invoke } = setup();
    expect(await invoke('kb:getCategories')).toEqual([expect.objectContaining({ id: 'domain', documentCount: 1 })]);

    expect(await invoke('kb:fixIndexes', false)).toEqual({ applied: false, changes: [] });
    expect(cli.fixIndexes).toHaveBeenLastCalledWith(kbPath, false);

    expect(await invoke('kb:fixIndexes', true)).toEqual({ applied: true, changes: [] });
    expect(cli.fixIndexes).toHaveBeenLastCalledWith(kbPath, true);
    // The rescan picked up the written index.md.
    expect(await invoke('kb:getDocument', 'domain/index.md')).toEqual(expect.objectContaining({ title: 'Domain' }));
  });

  it('kb:health rescans the explorer, so a document created since the last scan opens (review)', async () => {
    const { kbPath, invoke } = setup();
    await invoke('kb:getCategories');
    fs.writeFileSync(path.join(kbPath, 'domain', 'fill.md'), doc('Fill'));
    await invoke('kb:health');
    expect(await invoke('kb:getDocument', 'domain/fill.md')).toEqual(expect.objectContaining({ title: 'Fill' }));
  });

  it('kb:fixIndexes treats anything but true as a dry run', async () => {
    const { kbPath, cli, invoke } = setup();
    await invoke('kb:fixIndexes', 'yes');
    expect(cli.fixIndexes).toHaveBeenLastCalledWith(kbPath, false);
  });
});
