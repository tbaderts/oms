import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { IpcMain } from 'electron';
import { registerSpecsIpc } from '../../src/main/ipc/specs.ipc';
import { ConfigService } from '../../src/main/services/ConfigService';
import type { SpecFile } from '../../src/shared/types/specs';

/** Collects ipcMain.handle registrations so tests can invoke them like the renderer would. */
function fakeIpcMain() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const ipcMain = { handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn) };
  const invoke = (channel: string, ...args: unknown[]) => handlers.get(channel)!({}, ...args);
  return { ipcMain: ipcMain as unknown as IpcMain, invoke };
}

describe('specs IPC', () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
  const tmp = (prefix: string) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    dirs.push(d);
    return d;
  };

  it('discovery follows contract paths saved in Settings', async () => {
    const root = tmp('cockpit-ws-');
    for (const [rel, name] of [['oms-contracts/src/main/openapi', 'a.yml'], ['custom/openapi', 'b.yml']]) {
      fs.mkdirSync(path.join(root, rel), { recursive: true });
      fs.writeFileSync(path.join(root, rel, name), 'openapi: 3.0.0\n');
    }
    const configService = new ConfigService(tmp('cockpit-cfg-'));
    const config = await configService.load();
    await configService.save({ ...config, general: { ...config.general, workspaceRoot: root } });
    const { ipcMain, invoke } = fakeIpcMain();
    registerSpecsIpc(ipcMain, configService);

    const first = (await invoke('specs:discoverFiles')) as SpecFile[];
    expect(first.map((f) => f.name)).toEqual(['a.yml']);

    // As the Settings view does: save a new config object with other contract paths.
    const current = configService.getConfig();
    await configService.save({ ...current, specs: { ...current.specs, openApiPaths: ['custom/openapi'] } });

    const second = (await invoke('specs:discoverFiles')) as SpecFile[];
    expect(second.map((f) => f.name)).toEqual(['b.yml']);
  });
});
