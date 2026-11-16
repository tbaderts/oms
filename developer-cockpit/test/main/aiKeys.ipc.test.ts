import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import type { IpcMain } from 'electron';
import { registerAiKeysIpc } from '../../src/main/ipc/aiKeys.ipc';
import { registerConfigIpc } from '../../src/main/ipc/config.ipc';
import { ConfigService } from '../../src/main/services/ConfigService';
import { KeyStore } from '../../src/main/ai/KeyStore';
import { notConfiguredReason } from '../../src/main/ai/AiService';
import type { CockpitConfig } from '../../src/shared/types/config';
import { allFileText, fakeCrypto } from './keyTestUtils';

const KEY = 'sk-ant-secret-0123456789';
const LEFTOVER = 'plain-local-leftover-key';

function fakeIpcMain() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const ipcMain = { handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn) };
  const invoke = async (channel: string, ...args: unknown[]) => handlers.get(channel)!({}, ...args);
  return { ipcMain: ipcMain as unknown as IpcMain, invoke };
}

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

async function setup(opts: { available?: boolean; env?: NodeJS.ProcessEnv } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-aikeys-'));
  dirs.push(dir);
  const configService = new ConfigService(dir);
  const base = await configService.load();
  await configService.save({ ...base, ai: { ...base.ai, provider: 'anthropic', apiKeyEnvVar: 'ANTHROPIC_API_KEY' } });
  const keyStore = new KeyStore(dir, fakeCrypto({ available: opts.available }), () => {});
  const { ipcMain, invoke } = fakeIpcMain();
  registerConfigIpc(ipcMain, configService);
  registerAiKeysIpc(ipcMain, { keyStore, configService, env: opts.env ?? {} });
  return { dir, configService, keyStore, invoke };
}

describe('AI key IPC (SPEC-0063)', () => {
  it('no IPC result contains a key (AC-3)', async () => {
    const ctx = await setup();
    // A plain-text leftover (encryption was unavailable at migration) must not reach the renderer either.
    await ctx.configService.save({ ...ctx.configService.getConfig(), ai: { ...ctx.configService.getConfig().ai, apiKey: LEFTOVER } });

    const results = [
      await ctx.invoke('ai:keys:set', 'anthropic', KEY),
      await ctx.invoke('ai:keys:status'),
      await ctx.invoke('config:load'),
      await ctx.invoke('ai:keys:clear', 'openai'),
    ];
    for (const r of results) {
      expect(JSON.stringify(r)).not.toContain(KEY);
      expect(JSON.stringify(r)).not.toContain(LEFTOVER);
    }
    expect((results[2] as CockpitConfig).ai).not.toHaveProperty('apiKey');
    expect(results[1]).toEqual({
      available: true,
      saved: { anthropic: true, openai: false, local: false },
      active: { provider: 'anthropic', source: 'saved', envVar: 'ANTHROPIC_API_KEY' },
    });
  });

  it('status reports the env fallback and none (AC-3, AC-5, AC-6)', async () => {
    const withEnv = await setup({ env: { ANTHROPIC_API_KEY: 'from-env' } });
    expect(await withEnv.invoke('ai:keys:status')).toMatchObject({ active: { source: 'env' } });
    await withEnv.invoke('ai:keys:set', 'anthropic', KEY);
    expect(await withEnv.invoke('ai:keys:status')).toMatchObject({ active: { source: 'saved' } });
    await withEnv.invoke('ai:keys:clear', 'anthropic');
    expect(await withEnv.invoke('ai:keys:status')).toMatchObject({ saved: { anthropic: false }, active: { source: 'env' } });
    expect(JSON.stringify(await withEnv.invoke('ai:keys:status'))).not.toContain('from-env');

    const none = await setup();
    expect(await none.invoke('ai:keys:status')).toMatchObject({ active: { source: 'none' } });
  });

  it('config:save never changes saved keys (AC-4)', async () => {
    const ctx = await setup();
    await ctx.invoke('ai:keys:set', 'anthropic', KEY);
    const loaded = (await ctx.invoke('config:load')) as CockpitConfig;

    const res = await ctx.invoke('config:save', { ...loaded, ai: { ...loaded.ai, temperature: 0.2, apiKey: 'renderer-sent-key' } });

    expect(res).toEqual({ ok: true });
    expect(ctx.keyStore.get('anthropic')).toBe(KEY);
    const onDisk = fs.readFileSync(path.join(ctx.dir, 'config.json'), 'utf-8');
    expect(onDisk).not.toContain('renderer-sent-key');
    expect(allFileText(ctx.dir)).not.toContain(KEY);
    expect(ctx.configService.getConfig().ai).not.toHaveProperty('apiKey');
    expect(ctx.configService.getConfig().ai.temperature).toBe(0.2); // the rest of the save applied
  });

  it('config:save keeps a leftover key the renderer cannot see, and cannot remove it (AC-4, AC-8)', async () => {
    const ctx = await setup({ available: false });
    await ctx.configService.save({ ...ctx.configService.getConfig(), ai: { ...ctx.configService.getConfig().ai, provider: 'local', apiKey: LEFTOVER } });
    const loaded = (await ctx.invoke('config:load')) as CockpitConfig;
    await ctx.invoke('config:save', { ...loaded, ai: { ...loaded.ai, model: 'qwen3:latest' } });
    expect(ctx.configService.getConfig().ai.apiKey).toBe(LEFTOVER);
    expect(ctx.configService.getConfig().ai.model).toBe('qwen3:latest');
  });

  it('config:save rejects an invalid variable name (AC-9)', async () => {
    const ctx = await setup();
    const loaded = (await ctx.invoke('config:load')) as CockpitConfig;

    const bad = await ctx.invoke('config:save', { ...loaded, ai: { ...loaded.ai, apiKeyEnvVar: 'sk-ant-abc' } });
    expect(bad).toMatchObject({ ok: false, code: 'invalid' });
    expect(ctx.configService.getConfig().ai.apiKeyEnvVar).toBe('ANTHROPIC_API_KEY');
    expect(fs.readFileSync(path.join(ctx.dir, 'config.json'), 'utf-8')).not.toContain('sk-ant-abc');

    expect(await ctx.invoke('config:save', { ...loaded, ai: { ...loaded.ai, apiKeyEnvVar: 'MY_KEY' } })).toEqual({ ok: true });
    expect(ctx.configService.getConfig().ai.apiKeyEnvVar).toBe('MY_KEY');
    expect(await ctx.invoke('config:save', { ...loaded, ai: { ...loaded.ai, apiKeyEnvVar: '' } })).toEqual({ ok: true }); // empty = no fallback
  });

  it('set reports encryption-unavailable (AC-8)', async () => {
    const ctx = await setup({ available: false });
    const res = await ctx.invoke('ai:keys:set', 'anthropic', KEY);
    expect(res).toMatchObject({ ok: false, code: 'encryption-unavailable' });
    expect((res as { message: string }).message).toMatch(/encryption/i);
    expect(await ctx.invoke('ai:keys:status')).toMatchObject({ available: false, saved: { anthropic: false } });
    expect(allFileText(ctx.dir)).not.toContain(KEY);
  });

  it('a pasted key left in the variable-name field never crosses to the renderer (review finding 4)', async () => {
    const PASTED = 'sk-ant-pasted-into-name-field';
    const ctx = await setup({ available: false }); // without encryption, migration leaves it in place
    await ctx.configService.save({ ...ctx.configService.getConfig(), ai: { ...ctx.configService.getConfig().ai, apiKeyEnvVar: PASTED } });

    const loaded = (await ctx.invoke('config:load')) as CockpitConfig;
    const status = await ctx.invoke('ai:keys:status');
    const reason = notConfiguredReason(ctx.configService.getConfig().ai, {});
    for (const r of [loaded, status, reason]) expect(JSON.stringify(r)).not.toContain(PASTED);
    expect(loaded.ai.apiKeyEnvVar).toBe('');
    expect(status).toMatchObject({ active: { envVar: '' } });
    expect(reason).toMatch(/not a variable name/);
  });

  it('a kept pasted key survives a settings round trip from the renderer (delta review, AC-8)', async () => {
    const PASTED = 'sk-ant-pasted-into-name-field';
    const ctx = await setup({ available: false });
    await ctx.configService.save({ ...ctx.configService.getConfig(), ai: { ...ctx.configService.getConfig().ai, apiKeyEnvVar: PASTED } });

    const loaded = (await ctx.invoke('config:load')) as CockpitConfig; // apiKeyEnvVar redacted to ''
    expect(await ctx.invoke('config:save', { ...loaded, general: { ...loaded.general, theme: 'dark' } })).toEqual({ ok: true });

    expect(ctx.configService.getConfig().ai.apiKeyEnvVar).toBe(PASTED);
    expect(JSON.parse(fs.readFileSync(path.join(ctx.dir, 'config.json'), 'utf-8')).ai.apiKeyEnvVar).toBe(PASTED);
    expect(ctx.configService.getConfig().general.theme).toBe('dark');

    // a valid name the user types does replace it
    expect(await ctx.invoke('config:save', { ...loaded, ai: { ...loaded.ai, apiKeyEnvVar: 'MY_KEY' } })).toEqual({ ok: true });
    expect(ctx.configService.getConfig().ai.apiKeyEnvVar).toBe('MY_KEY');
  });

  it('rejects malformed arguments without throwing', async () => {
    const ctx = await setup();
    expect(await ctx.invoke('ai:keys:set', 'bogus', KEY)).toMatchObject({ ok: false, code: 'invalid' });
    expect(await ctx.invoke('ai:keys:set', 'anthropic', 42)).toMatchObject({ ok: false, code: 'invalid' });
    expect(await ctx.invoke('ai:keys:clear', 'bogus')).toMatchObject({ ok: false, code: 'invalid' });
  });
});
