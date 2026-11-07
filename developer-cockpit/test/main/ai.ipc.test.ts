import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import type { IpcMain } from 'electron';
import { registerAiIpc, type AiIpcDeps } from '../../src/main/ipc/ai.ipc';
import { ConfigService } from '../../src/main/services/ConfigService';
import { AiUsageTracker } from '../../src/main/ai/AiUsageTracker';
import type { KbService } from '../../src/main/services/KbService';
import { DEFAULT_CONFIG } from '../../src/shared/types/config';
import type { AiEvent } from '../../src/shared/types/ai';
import type { CockpitEvent } from '../../src/shared/types/events';

function fakeIpcMain() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const ipcMain = { handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn) };
  const invoke = (channel: string, ...args: unknown[]) =>
    Promise.resolve((() => {
      const h = handlers.get(channel);
      if (!h) throw new Error(`no handler for ${channel}`);
      return h({}, ...args);
    })());
  return { ipcMain: ipcMain as unknown as IpcMain, invoke, channels: () => [...handlers.keys()] };
}

/** A deterministic KB: a couple of documents, no network, no real workspace needed. */
function fakeKb(): Pick<KbService, 'search'> {
  return {
    search: (query: string) => [
      { score: 0.9, document: { title: `Doc for ${query}`, relativePath: 'oms-knowledge-base/functional-requirements/FR-001-accept.md', category: 'functional-requirements' } },
    ],
  };
}

interface Ctx {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  channels: () => string[];
  events: AiEvent[];
  tracker: AiUsageTracker;
  runtime: ReturnType<typeof registerAiIpc>;
  configService: ConfigService;
}

async function setup(opts: { key?: string; provider?: 'anthropic' | 'local'; baseUrl?: string; cfgDir?: string } = {}): Promise<Ctx> {
  const cfgDir = opts.cfgDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-ai-cfg-'));
  if (!opts.cfgDir) dirs.push(cfgDir);
  const configService = new ConfigService(cfgDir);
  const base = await configService.load();
  await configService.save({
    ...base,
    ai: {
      ...base.ai,
      provider: opts.provider ?? 'anthropic',
      ...(opts.provider === 'local' ? { baseUrl: opts.baseUrl ?? 'http://localhost:11434/v1' } : {}),
      model: 'test-model',
    },
  });
  const env: NodeJS.ProcessEnv = { ...(opts.key ? { ANTHROPIC_API_KEY: opts.key } : {}) };
  const events: AiEvent[] = [];
  const tracker = new AiUsageTracker(cfgDir);
  const { ipcMain, invoke, channels } = fakeIpcMain();
  const runtime = registerAiIpc(ipcMain, {
    configService,
    env,
    kb: fakeKb,
    usage: tracker,
    broadcast: (e: CockpitEvent<AiEvent>) => events.push(e.payload),
  });
  return { invoke, channels, events, tracker, runtime, configService };
}

const dirs: string[] = [];

describe('ai IPC', () => {
  afterEach(() => {
    dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
  });

  it('registers the ai:available, ai:run, ai:stop, ai:usage channels', async () => {
    const ctx = await setup({ key: 'k' });
    expect(ctx.channels().sort()).toEqual(['ai:available', 'ai:run', 'ai:stop', 'ai:usage']);
    ctx.runtime.dispose();
  });

  it('ai:available reflects the configuration', async () => {
    // A valid key makes the configured anthropic provider available.
    const withKey = await setup({ key: 'sk-test' });
    expect(await withKey.invoke('ai:available')).toMatchObject({ available: true, provider: 'anthropic' });
    withKey.runtime.dispose();

    // Missing/empty key: not available, with a reason naming the missing variable (never its value).
    const noKey = await setup();
    const missing = await noKey.invoke('ai:available');
    expect(missing.available).toBe(false);
    expect(missing.reason).toMatch(/ANTHROPIC_API_KEY/);
    noKey.runtime.dispose();

    // local provider: available exactly when a base URL is configured; no key is required.
    const localDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-ai-local-'));
    dirs.push(localDir);
    const localWith = await setup({ provider: 'local', baseUrl: 'http://localhost:11434/v1', cfgDir: localDir });
    expect(await localWith.invoke('ai:available')).toMatchObject({ available: true, provider: 'local', model: 'test-model' });
    localWith.runtime.dispose();

    const localNoUrl = await setup({ provider: 'local', baseUrl: '', cfgDir: localDir });
    const localMissing = await localNoUrl.invoke('ai:available');
    expect(localMissing.available).toBe(false);
    expect(localMissing.reason).toMatch(/base URL/i);
    localNoUrl.runtime.dispose();
  });

  it('ai:run starts a run and returns its id; ai:stop on an unknown runId is a no-op, not a throw', async () => {
    const ctx = await setup({ key: 'sk-test' });
    const started = await ctx.invoke('ai:run', 'run-1', 'explain the order flow');
    expect(started).toMatchObject({ ok: true, runId: 'run-1' });
    // Give the (real, unresolvable-in-test) run a moment; the start itself never threw.
    await new Promise((r) => setTimeout(r, 100));
    await expect(ctx.invoke('ai:stop', 'run-never-started')).resolves.toBeUndefined();
    await expect(ctx.invoke('ai:stop', 'run-never-started')).resolves.toBeUndefined();
    ctx.runtime.dispose();
  });

  it('ai:run rejects malformed arguments without throwing', async () => {
    const ctx = await setup({ key: 'sk-test' });
    expect(await ctx.invoke('ai:run', 42, 'prompt')).toMatchObject({ ok: false, code: 'invalid' });
    expect(await ctx.invoke('ai:run', 'run-x', 42)).toMatchObject({ ok: false, code: 'invalid' });
    expect(await ctx.invoke('ai:run', 'run-x', '')).toMatchObject({ ok: false, code: 'invalid' });
    await expect(ctx.invoke('ai:stop')).resolves.toBeUndefined();
    ctx.runtime.dispose();
  });

  it('ai:usage returns the accumulated usage summary', async () => {
    const ctx = await setup({ key: 'sk-test' });
    ctx.tracker.record({ timestamp: new Date().toISOString(), provider: 'anthropic', model: 'test-model', feature: 'assistant', inputTokens: 100, outputTokens: 40 });
    expect(await ctx.invoke('ai:usage')).toEqual({ entries: 1, totalInput: 100, totalOutput: 40 });
    ctx.runtime.dispose();
  });
});
