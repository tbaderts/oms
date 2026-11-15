import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IpcMain } from 'electron';
import type { LanguageModel } from 'ai';
import { registerAiIpc } from '../../src/main/ipc/ai.ipc';
import { DEFAULT_READ_LIMIT } from '../../src/main/ai/KbChatTools';
import { ConfigService } from '../../src/main/services/ConfigService';
import { AiUsageTracker } from '../../src/main/ai/AiUsageTracker';
import type { AiEvent, KbChatMessage } from '../../src/shared/types/ai';
import type { CockpitEvent } from '../../src/shared/types/events';
import type { KbDocument } from '../../src/shared/types/kb';
import { KNOWLEDGE_SERVER_TOOLS, startStubMcpServer, type StubMcpServer } from './stubMcpServer';

/*
 * The KB chat IPC (SPEC-0062) with a scripted model (the same hand-rolled v4 fake as
 * AiService.test.ts) and a stub knowledge server or an unreachable URL.
 */
function fakeIpcMain() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const ipcMain = { handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn) };
  const invoke = (channel: string, ...args: unknown[]) => Promise.resolve(handlers.get(channel)!({}, ...args));
  return { ipcMain: ipcMain as unknown as IpcMain, invoke };
}

const finish = (unified: string) => ({
  type: 'finish',
  finishReason: { unified, raw: unified },
  usage: { inputTokens: { total: 12 }, outputTokens: { total: 6, text: 6, reasoning: 0 } },
});

type Prompt = { role: string; content: unknown }[];

/** A model that answers `text`; records the prompt of each call. */
function scriptedModel(text: string, prompts: Prompt[] = []): LanguageModel {
  return {
    specificationVersion: 'v4',
    provider: 'fake',
    modelId: 'm',
    supportedUrls: {},
    doGenerate: async () => {
      throw new Error('not used');
    },
    doStream: async (options: { prompt: Prompt }) => {
      prompts.push(options.prompt);
      const parts = [
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 't' },
        { type: 'text-delta', id: 't', delta: text },
        { type: 'text-end', id: 't' },
        finish('stop'),
      ];
      return { stream: new ReadableStream({ start: (c) => (parts.forEach((p) => c.enqueue(p)), c.close()) }) };
    },
  } as unknown as LanguageModel;
}

/** A model that first calls `toolName` with `input`, then (after the tool result) answers `text`. */
function toolThenTextModel(toolName: string, input: Record<string, unknown>, text: string, prompts: Prompt[] = []): LanguageModel {
  let call = 0;
  return {
    ...(scriptedModel('') as object),
    doStream: async (options: { prompt: Prompt }) => {
      prompts.push(options.prompt);
      const parts =
        call++ === 0
          ? [
              { type: 'stream-start', warnings: [] },
              { type: 'tool-input-start', id: 'c1', toolName },
              { type: 'tool-input-delta', id: 'c1', delta: JSON.stringify(input) },
              { type: 'tool-input-end', id: 'c1' },
              { type: 'tool-call', toolCallId: 'c1', toolName, input: JSON.stringify(input) },
              finish('tool-calls'),
            ]
          : [
              { type: 'stream-start', warnings: [] },
              { type: 'text-start', id: 't' },
              { type: 'text-delta', id: 't', delta: text },
              { type: 'text-end', id: 't' },
              finish('stop'),
            ];
      return { stream: new ReadableStream({ start: (c) => (parts.forEach((p) => c.enqueue(p)), c.close()) }) };
    },
  } as unknown as LanguageModel;
}

function failingModel(): LanguageModel {
  return { ...(scriptedModel('') as object), doStream: async () => { throw new Error('provider exploded'); } } as unknown as LanguageModel;
}

/** A model that streams one chunk and then waits until the run is aborted. */
function hangingModel(): LanguageModel {
  return {
    ...(scriptedModel('') as object),
    doStream: async (options: { abortSignal?: AbortSignal }) => ({
      stream: new ReadableStream({
        start(c) {
          c.enqueue({ type: 'stream-start', warnings: [] });
          c.enqueue({ type: 'text-start', id: 't' });
          c.enqueue({ type: 'text-delta', id: 't', delta: 'partial' });
          options.abortSignal?.addEventListener('abort', () => {
            try {
              c.error(Object.assign(new Error('aborted'), { name: 'AbortError' }));
            } catch {
              // already closed
            }
          });
        },
      }),
    }),
  } as unknown as LanguageModel;
}

const dirs: string[] = [];
let stub: StubMcpServer | null = null;

async function setup(model: LanguageModel, knowledgeServerUrl: string, docs: KbDocument[] = []) {
  const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-kbchat-'));
  dirs.push(cfgDir);
  const configService = new ConfigService(cfgDir);
  const base = await configService.load();
  await configService.save({ ...base, ai: { ...base.ai, provider: 'anthropic', model: 'test-model', knowledgeServerUrl } });
  const events: AiEvent[] = [];
  const tracker = new AiUsageTracker(cfgDir);
  const record = vi.spyOn(tracker, 'record');
  const { ipcMain, invoke } = fakeIpcMain();
  const runtime = registerAiIpc(ipcMain, {
    configService,
    env: { ANTHROPIC_API_KEY: 'k' },
    kb: () => ({ search: () => [], getDocument: (p: string) => docs.find((d) => d.relativePath === p) }),
    usage: tracker,
    model,
    broadcast: (e: CockpitEvent<AiEvent>) => events.push(e.payload),
  });
  return { invoke, events, record, runtime };
}

async function waitForDone(events: AiEvent[], runId: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (events.some((e) => e.type === 'ai:done' && e.runId === runId)) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`no ai:done for ${runId}`);
}

const q = (content: string): KbChatMessage => ({ role: 'user', content });
const a = (content: string): KbChatMessage => ({ role: 'assistant', content });

afterEach(() => {
  stub?.close();
  stub = null;
  dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
});

describe('ai:kbChat (SPEC-0062)', () => {
  it('starts a kb-chat run and streams the answer (AC-1)', async () => {
    stub = await startStubMcpServer(KNOWLEDGE_SERVER_TOOLS);
    const ctx = await setup(scriptedModel('The lifecycle has 6 states.'), stub.url);
    const res = await ctx.invoke('ai:kbChat', 'kb-1', [q('What are the order states?')]);
    expect(res).toEqual({ ok: true, runId: 'kb-1', source: 'knowledge-server' });
    await waitForDone(ctx.events, 'kb-1');
    const mine = ctx.events.filter((e) => e.runId === 'kb-1');
    expect(mine.filter((e) => e.type === 'ai:message').map((e) => (e as { text: string }).text).join('')).toBe('The lifecycle has 6 states.');
    expect(mine.filter((e) => e.type === 'ai:done')).toHaveLength(1);
    ctx.runtime.dispose();
  });

  it('completes with local tools when the server is down (AC-3)', async () => {
    const ctx = await setup(scriptedModel('ok'), 'http://127.0.0.1:1/mcp');
    const res = await ctx.invoke('ai:kbChat', 'kb-2', [q('anything')]);
    expect(res).toMatchObject({ ok: true, source: 'local' });
    await waitForDone(ctx.events, 'kb-2');
    expect(ctx.events.find((e) => e.type === 'ai:done')).toMatchObject({ aborted: false });
    ctx.runtime.dispose();
  });

  it('a tool call made by the model reaches the knowledge server (AC-2)', async () => {
    stub = await startStubMcpServer(KNOWLEDGE_SERVER_TOOLS);
    const prompts: Prompt[] = [];
    const path = 'oms-knowledge-base/domain/concepts/order-lifecycle.md';
    const ctx = await setup(toolThenTextModel('readKnowledgeBase', { path }, 'Summary.', prompts), stub.url);
    await ctx.invoke('ai:kbChat', 'kb-mcp', [q('Summarise the lifecycle')]);
    await waitForDone(ctx.events, 'kb-mcp');

    expect(stub.calls).toEqual([{ name: 'readKnowledgeBase', arguments: { path, anchor: '', offset: 0, limit: DEFAULT_READ_LIMIT } }]);
    const result = ctx.events.find((e) => e.type === 'ai:tool-result') as { name: string; output: string };
    expect(result).toMatchObject({ name: 'readKnowledgeBase' });
    expect(result.output).toContain('The order lifecycle.');
    expect(prompts).toHaveLength(2); // the model saw the tool result before answering
    expect(ctx.events.filter((e) => e.type === 'ai:message').map((e) => (e as { text: string }).text).join('')).toBe('Summary.');
    ctx.runtime.dispose();
  });

  it('with the server down, the model reads a document through the local read tool (AC-3)', async () => {
    const lifecycle: KbDocument = {
      path: '/kb/domain/concepts/order-lifecycle.md',
      relativePath: 'domain/concepts/order-lifecycle.md',
      title: 'Order lifecycle',
      category: 'domain',
      folder: 'domain/concepts',
      content: 'Orders move from NEW to FILLED.',
      frontmatter: {},
      lastModified: 0,
    };
    const ctx = await setup(
      toolThenTextModel('read_knowledge_base_document', { path: 'oms-knowledge-base/domain/concepts/order-lifecycle.md' }, 'Done.'),
      'http://127.0.0.1:1/mcp',
      [lifecycle],
    );
    expect(await ctx.invoke('ai:kbChat', 'kb-local', [q('Summarise the lifecycle')])).toMatchObject({ source: 'local' });
    await waitForDone(ctx.events, 'kb-local');

    const result = ctx.events.find((e) => e.type === 'ai:tool-result') as { name: string; output: string };
    expect(result).toMatchObject({ name: 'read_knowledge_base_document' });
    expect(result.output).toContain('Orders move from NEW to FILLED.');
    expect(ctx.events.at(-1)).toMatchObject({ type: 'ai:done', runId: 'kb-local', aborted: false });
    ctx.runtime.dispose();
  });

  it('passes the conversation to the model in order (AC-6)', async () => {
    const prompts: Prompt[] = [];
    const ctx = await setup(scriptedModel('a2', prompts), 'http://127.0.0.1:1/mcp');
    await ctx.invoke('ai:kbChat', 'kb-3', [q('q1'), a('a1'), q('q2')]);
    await waitForDone(ctx.events, 'kb-3');
    const turns = prompts[0].filter((m) => m.role !== 'system').map((m) => {
      const c = m.content;
      return `${m.role}:${typeof c === 'string' ? c : (c as { text?: string }[]).map((p) => p.text ?? '').join('')}`;
    });
    expect(turns).toEqual(['user:q1', 'assistant:a1', 'user:q2']);
    ctx.runtime.dispose();
  });

  it('rejects malformed messages (AC-6)', async () => {
    const ctx = await setup(scriptedModel('x'), 'http://127.0.0.1:1/mcp');
    const bad: unknown[] = [
      [],
      'not an array',
      [{ role: 'system', content: 'x' }],
      [{ role: 'user', content: '' }],
      [q('q1'), a('a1')], // must end with the user's question
      [q('x'.repeat(32_001))],
      Array.from({ length: 23 }, (_, i) => (i % 2 ? a('a') : q('q'))),
    ];
    for (const messages of bad) {
      expect(await ctx.invoke('ai:kbChat', `bad-${Math.random()}`, messages)).toMatchObject({ ok: false, code: 'invalid' });
    }
    expect(await ctx.invoke('ai:kbChat', '', [q('q')])).toMatchObject({ ok: false, code: 'invalid' });
    expect(ctx.events).toEqual([]);
    ctx.runtime.dispose();
  });

  it('provider failure ends the run and records usage once (AC-8)', async () => {
    const failing = await setup(failingModel(), 'http://127.0.0.1:1/mcp');
    await failing.invoke('ai:kbChat', 'kb-f', [q('q')]);
    await waitForDone(failing.events, 'kb-f');
    const types = failing.events.map((e) => e.type);
    expect(types).toContain('ai:error');
    expect(types.indexOf('ai:error')).toBeLessThan(types.indexOf('ai:done'));
    expect(types.filter((t) => t === 'ai:done')).toHaveLength(1);
    failing.runtime.dispose();

    const ok = await setup(scriptedModel('fine'), 'http://127.0.0.1:1/mcp');
    await ok.invoke('ai:kbChat', 'kb-u', [q('q')]);
    await waitForDone(ok.events, 'kb-u');
    expect(ok.record).toHaveBeenCalledTimes(1);
    expect(ok.record.mock.calls[0][0]).toMatchObject({ feature: 'kb-chat', inputTokens: 12, outputTokens: 6 });
    ok.runtime.dispose();
  });

  it('a stop that arrives while the tools are being built ends the run without calling the model (AC-8)', async () => {
    // A knowledge server that takes 300 ms to answer `initialize`, so the stop lands mid-build.
    const slow = http.createServer((_req, res) => setTimeout(() => (res.writeHead(500), res.end()), 300));
    await new Promise<void>((r) => slow.listen(0, '127.0.0.1', () => r()));
    const url = `http://127.0.0.1:${(slow.address() as { port: number }).port}/mcp`;
    const prompts: Prompt[] = [];
    const ctx = await setup(scriptedModel('should never stream', prompts), url);

    const started = ctx.invoke('ai:kbChat', 'kb-early', [q('q')]);
    await new Promise((r) => setTimeout(r, 50));
    await ctx.invoke('ai:stop', 'kb-early');
    expect(await started).toMatchObject({ ok: true, runId: 'kb-early' });
    await waitForDone(ctx.events, 'kb-early');

    expect(ctx.events.filter((e) => e.runId === 'kb-early')).toEqual([expect.objectContaining({ type: 'ai:done', aborted: true })]);
    expect(prompts).toEqual([]);
    ctx.runtime.dispose();
    slow.close();
  });

  it('stop aborts a kb-chat run (AC-8)', async () => {
    const ctx = await setup(hangingModel(), 'http://127.0.0.1:1/mcp');
    await ctx.invoke('ai:kbChat', 'kb-s', [q('q')]);
    for (let i = 0; i < 100 && !ctx.events.some((e) => e.type === 'ai:message'); i++) await new Promise((r) => setTimeout(r, 10));
    await ctx.invoke('ai:stop', 'kb-s');
    await waitForDone(ctx.events, 'kb-s');
    expect(ctx.events.find((e) => e.type === 'ai:done')).toMatchObject({ runId: 'kb-s', aborted: true });
    ctx.runtime.dispose();
  });
});
