import { describe, expect, it, vi } from 'vitest';
import type { IpcMain } from 'electron';
import { registerDockerIpc } from '../../src/main/ipc/docker.ipc';
import type { ConfigService } from '../../src/main/services/ConfigService';
import { DEFAULT_CONFIG } from '../../src/shared/types/config';

function fakeIpcMain() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const ipcMain = { handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn) };
  const invoke = (channel: string, ...args: unknown[]) =>
    Promise.resolve((() => {
      const h = handlers.get(channel);
      if (!h) throw new Error(`no handler for ${channel}`);
      return h({}, ...args);
    })());
  return { ipcMain: ipcMain as unknown as IpcMain, invoke };
}

function fakeConfigService(overrides: Partial<typeof DEFAULT_CONFIG.infrastructure> = {}): ConfigService {
  const config = { ...DEFAULT_CONFIG, infrastructure: { ...DEFAULT_CONFIG.infrastructure, ...overrides } };
  return {
    getConfig: () => config,
    getWorkspaceRoot: () => '/tmp',
    getKnowledgeBasePath: () => '/tmp/kb',
    getConfigDir: () => '/tmp',
  } as unknown as ConfigService;
}

describe('docker.ipc', () => {
  it('AC-7: docker:list returns unavailable when the CLI is missing', async () => {
    const { ipcMain, invoke } = fakeIpcMain();
    const configService = fakeConfigService();
    const fakeExecFile = vi.fn((_cmd: string, _args: string[], _opts: unknown, cb: (err: NodeJS.ErrnoException | null, stdout: string, stderr: string) => void) => {
      const err = Object.assign(new Error('spawn docker ENOENT'), { code: 'ENOENT' });
      cb(err, '', '');
    });
    registerDockerIpc(ipcMain, { configService, execFile: fakeExecFile as never });

    const result = await invoke('docker:list');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('unavailable');
    expect(result.message).toMatch(/not found|not reachable/i);
  });

  it('docker:list returns the container list on success', async () => {
    const { ipcMain, invoke } = fakeIpcMain();
    const configService = fakeConfigService();
    const fakeExecFile = vi.fn((_cmd: string, args: string[], _opts: unknown, cb: (err: NodeJS.ErrnoException | null, stdout: string, stderr: string) => void) => {
      if (args[0] === 'ps') return cb(null, JSON.stringify({ ID: 'abc', Names: 'oms-core', Image: 'oms-core:latest', State: 'running', Status: 'Up 5m', HealthStatus: 'healthy', Ports: '' }), '');
      if (args[0] === 'stats') return cb(null, JSON.stringify({ ID: 'abc', Name: 'oms-core', CPUPerc: '0.5%', MemUsage: '100MiB / 8GiB' }), '');
      cb(null, '', '');
    });
    registerDockerIpc(ipcMain, { configService, execFile: fakeExecFile as never });

    const result = await invoke('docker:list');
    expect(result.ok).toBe(true);
    expect(result.containers).toHaveLength(1);
    expect(result.containers[0].name).toBe('oms-core');
    expect(result.containers[0].cpu).toBe('0.5%');
  });

  it('docker:logs validates the container name is a non-empty string', async () => {
    const { ipcMain, invoke } = fakeIpcMain();
    const configService = fakeConfigService();
    const fakeExecFile = vi.fn((_cmd: string, _args: string[], _opts: unknown, cb: (err: NodeJS.ErrnoException | null, stdout: string, stderr: string) => void) => {
      cb(null, '', '');
    });
    registerDockerIpc(ipcMain, { configService, execFile: fakeExecFile as never });

    // Empty string
    const empty = await invoke('docker:logs', '');
    expect(empty.ok).toBe(false);
    expect(empty.code).toBe('invalid');

    // Non-string
    const nonString = await invoke('docker:logs', 123);
    expect(nonString.ok).toBe(false);
    expect(nonString.code).toBe('invalid');
  });
});
