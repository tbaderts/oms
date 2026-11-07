import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tool, jsonSchema, streamText } from 'ai';
import { z } from 'zod';
import { AiService, notConfiguredReason } from '../../src/main/ai/AiService';
import { forConfig } from '../../src/main/ai/adapters';

// The provider factory is the not-configured gate (AC-3): stub it so the tests never hit the
// network and can force a `null` (not configured) resolution deterministically.
vi.mock('../../src/main/ai/adapters', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/main/ai/adapters')>();
  return { ...actual, forConfig: vi.fn(actual.forConfig) };
});
import { DEFAULT_CONFIG, type AiConfig } from '../../src/shared/types/config';
import type { AiEvent } from '../../src/shared/types/ai';

/*
 * The `ai` SDK v7 ships no mock model, so the tests use a hand-rolled fake v4 LanguageModel:
 * own enumerable props (specificationVersion, provider, modelId, supportedUrls) plus doStream.
 * In the *model* stream, text uses text-start/text-delta{id,delta}/text-end, a tool call is a
 * `tool-call` part whose `input` is a JSON string (the SDK safeParseJSONs it), and each model
 * call starts with `stream-start` and ends with `finish` (the SDK derives the step parts).
 */
function streamFrom(script: unknown[]) {
  return new ReadableStream({
    start(c) {
      for (const p of script) c.enqueue({ ...(p as Record<string, unknown>), delta: (p as Record<string, unknown>).delta ?? (p as Record<string, unknown>).text ?? '' });
      c.close();
    },
  });
}

interface FakeModelOpts {
  script: unknown[];
  calls?: number[];
}

function fakeModel({ script, calls }: FakeModelOpts, provider = 'fake', modelId = 'm') {
  return {
    specificationVersion: 'v4',
    provider,
    modelId,
    supportedUrls: {},
    doGenerate: async () => {
      throw new Error('doGenerate not used in these tests');
    },
    doStream: async () => {
      calls?.push(1);
      return { stream: streamFrom(script) };
    },
  } as unknown as import('ai').LanguageModel;
}

const finish = (unified: string, input = 10, output = 5) => ({
  type: 'finish',
  finishReason: { unified, raw: unified },
  usage: { inputTokens: { total: input }, outputTokens: { total: output, text: output, reasoning: 0 } },
});

const textStep = (id: string, text: string) => [
  { type: 'text-start', id },
  { type: 'text-delta', id, delta: text },
  { type: 'text-end', id },
];

const toolCallStep = (toolName: string, inputObj: unknown, id = 'c1') => [
  { type: 'tool-input-start', id, toolName },
  { type: 'tool-input-delta', id, delta: JSON.stringify(inputObj) },
  { type: 'tool-input-end', id },
  { type: 'tool-call', toolCallId: id, toolName, input: JSON.stringify(inputObj) },
];

const usage = () => ({
  record: (e: Record<string, unknown>) => entries.push(e),
});
const entries: Record<string, unknown>[] = [];

interface Harness {
  service: AiService;
  events: AiEvent[];
}

function makeService(opts: {
  config?: AiConfig;
  env?: NodeJS.ProcessEnv;
  model?: import('ai').LanguageModel | null;
  tools?: Record<string, unknown>;
}): Harness {
  const events: AiEvent[] = [];
  const service = new AiService(opts.config ?? DEFAULT_CONFIG.ai, opts.env ?? {}, {
    broadcast: (e) => events.push(e),
    tools: opts.tools,
    usage: usage(),
    model: opts.model,
    log: () => {},
  });
  return { service, events };
}

const types = (events: AiEvent[]) => events.map((e) => e.type);
const textOf = (events: AiEvent[]) => events.filter((e) => e.type === 'ai:message').map((e) => (e as { text: string }).text).join('');

describe('AiService.one-shot (AC-1, AC-2, AC-3)', () => {
  beforeEach(() => {
    entries.length = 0;
    vi.mocked(forConfig).mockReset();
  });

  it('AC-1: streams text deltas then ai:done; no ai:* before the first ai:message', async () => {
    const calls: number[] = [];
    const model = fakeModel({
      calls,
      script: [
        { type: 'stream-start', warnings: [] },
        ...textStep('t1', 'Hello '),
        ...textStep('t1', 'world'),
        finish('stop', 11, 7),
      ],
    });
    const { service, events } = makeService({ config: { ...DEFAULT_CONFIG.ai, provider: 'anthropic' }, env: { ANTHROPIC_API_KEY: 'k' }, model });
    await service.complete({ prompt: 'say hi', runId: 'run-1' });

    expect(types(events)).toEqual(['ai:message', 'ai:message', 'ai:done']);
    expect(events[0]).toMatchObject({ type: 'ai:message', runId: 'run-1', text: 'Hello ' });
    expect(events[1]).toMatchObject({ type: 'ai:message', runId: 'run-1', text: 'world' });
    expect(events[2]).toMatchObject({ type: 'ai:done', runId: 'run-1', aborted: false, incomplete: false });
    // The provider model was used (the injected model was called).
    expect(calls).toHaveLength(1);
    // Usage was recorded (AC-7).
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ provider: 'anthropic', model: DEFAULT_CONFIG.ai.model, feature: 'one-shot', inputTokens: 11, outputTokens: 7 });
    entries.length = 0;
  });

  it('AC-2: openai and local configs resolve to the right model and reach ai:done', async () => {
    // openai
    let openaiCalls: number[] = [];
    let { service, events } = makeService({
      config: { ...DEFAULT_CONFIG.ai, provider: 'openai', apiKeyEnvVar: 'OPENAI_API_KEY', model: 'gpt-4o' },
      env: { OPENAI_API_KEY: 'k' },
      model: fakeModel({ calls: openaiCalls, script: [{ type: 'stream-start', warnings: [] }, ...textStep('t', 'hi'), finish('stop', 3, 2)] }),
    });
    await service.complete({ prompt: 'p', runId: 'r' });
    expect(types(events)).toEqual(['ai:message', 'ai:done']);
    expect(openaiCalls).toHaveLength(1);
    expect(entries[0]).toMatchObject({ provider: 'openai', model: 'gpt-4o' });
    entries.length = 0;

    // local
    let localCalls: number[] = [];
    ({ service, events } = makeService({
      config: { ...DEFAULT_CONFIG.ai, provider: 'local', model: 'qwen2.5:7b', apiKeyEnvVar: 'OLLAMA_API_KEY', baseUrl: 'http://127.0.0.1:11434/v1' },
      env: {},
      model: fakeModel({ calls: localCalls, script: [{ type: 'stream-start', warnings: [] }, ...textStep('t', 'hi'), finish('stop', 3, 2)] }),
    }));
    await service.complete({ prompt: 'p', runId: 'r' });
    expect(types(events)).toEqual(['ai:message', 'ai:done']);
    expect(localCalls).toHaveLength(1);
    expect(entries[0]).toMatchObject({ provider: 'local', model: 'qwen2.5:7b' });
    entries.length = 0;
  });

  it('AC-3: a missing key emits ai:error (configuration) and never calls a model', async () => {
    let calls: number[] = [];
    // Force the not-configured resolution (empty env for anthropic); the injected fake must not
    // be used.
    vi.mocked(forConfig).mockReturnValue(null);
    const { service, events } = makeService({
      config: { ...DEFAULT_CONFIG.ai, provider: 'anthropic' },
      env: {},
      model: fakeModel({ calls, script: [{ type: 'stream-start', warnings: [] }, ...textStep('t', 'should never appear'), finish('stop')] }),
    });
    await service.complete({ prompt: 'p', runId: 'r' });
    expect(types(events)).toEqual(['ai:error']);
    expect(events[0]).toMatchObject({ type: 'ai:error', code: 'configuration' });
    expect((events[0] as { message: string }).message).toContain('ANTHROPIC_API_KEY');
    expect(calls).toHaveLength(0); // no network call
    expect(notConfiguredReason({ ...DEFAULT_CONFIG.ai, provider: 'anthropic' }, {})).toContain('ANTHROPIC_API_KEY');
    expect(notConfiguredReason({ ...DEFAULT_CONFIG.ai, provider: 'local' }, {})).toContain('base URL');
  });
});

describe('AiService.runAgent (AC-4, AC-5, AC-6, AC-8)', () => {
  beforeEach(() => {
    entries.length = 0;
    vi.mocked(forConfig).mockReset();
  });

  const kbTool = (hits: Record<string, unknown>[]) =>
    tool({
      description: 'Search the knowledge base',
      inputSchema: jsonSchema(z.object({ query: z.string().min(1) })),
      execute: async ({ query }: { query: string }) => (hits.find((h) => h.query === query) ?? { query, count: 0, results: [] }),
    });

  it('AC-4: the agent loop calls the KB tool and the final answer reflects its output', async () => {
    const calls: number[] = [];
    const script = [
      { type: 'stream-start', warnings: [] },
      ...toolCallStep('search_knowledge_base', { query: 'order lifecycle' }),
      finish('tool-calls', 12, 6),
      { type: 'stream-start', warnings: [] },
      ...textStep('t', 'The order lifecycle starts at NEW. (from the KB)'),
      finish('stop', 15, 8),
    ];
    const { service, events } = makeService({
      config: { ...DEFAULT_CONFIG.ai, provider: 'anthropic' },
      env: { ANTHROPIC_API_KEY: 'k' },
      model: fakeModel({ calls, script }),
      tools: { search_knowledge_base: kbTool([{ query: 'order lifecycle', count: 1, results: [{ title: 'Order lifecycle', path: 'oms-concepts/order-lifecycle.md', category: 'oms-concepts' }] }]) },
    });
    await service.runAgent({ prompt: 'how does the order lifecycle work', runId: 'r' });

    const types = events.map((e) => e.type);
    expect(types).toContain('ai:tool-call');
    expect(types).toContain('ai:tool-result');
    // order: the tool call precedes its result, which precedes the final message
    expect(types.indexOf('ai:tool-call')).toBeLessThan(types.indexOf('ai:tool-result'));
    expect(types.indexOf('ai:tool-result')).toBeLessThan(types.lastIndexOf('ai:message'));
    const call = events.find((e) => e.type === 'ai:tool-call') as { name: string; input: Record<string, unknown> };
    expect(call.name).toBe('search_knowledge_base');
    expect(call.input).toEqual({ query: 'order lifecycle' });
    const result = events.find((e) => e.type === 'ai:tool-result') as { output: string };
    expect(result.output).toContain('Order lifecycle');
    // the final answer reflects the tool's known content
    expect(textOf(events)).toContain('The order lifecycle starts at NEW');
    expect(events[events.length - 1]).toMatchObject({ type: 'ai:done', aborted: false, incomplete: false });
    // a model call did happen (the fake streams both the tool-calling and final step in one call)
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  it('AC-5: stop(runId) aborts mid-run — no events after the abort, terminal ai:done{aborted:true}', async () => {
    const abortAfter = vi.fn(() => {});
    const script: unknown[] = [
      { type: 'stream-start', warnings: [] },
      ...textStep('t1', 'first chunk'),
    ];
    // A script that streams, then the abort lands, then (in a real provider) more chunks — the
    // SDK stops emitting after the abort part.
    const model = {
      specificationVersion: 'v4',
      provider: 'fake',
      modelId: 'm',
      supportedUrls: {},
      doGenerate: async () => {
        throw new Error('x');
      },
      doStream: async () => {
        const stream = new ReadableStream({
          start(c) {
            let closed = false;
            for (const p of script) c.enqueue({ ...(p as Record<string, unknown>), delta: (p as Record<string, unknown>).delta ?? (p as Record<string, unknown>).text ?? '' });
            setTimeout(() => abortAfter(), 30);
            setTimeout(() => {
              // Guard against an already-closed controller (the SDK closes the stream on abort).
              if (!closed) {
                try {
                  c.enqueue({ type: 'text-delta', id: 't2', delta: 'should not appear' });
                  c.close();
                } catch {
                  // The stream was closed by the SDK in the meantime; ignore.
                }
                closed = true;
              }
            }, 80);
          },
        });
        return { stream };
      },
    } as unknown as import('ai').LanguageModel;
    const { service, events } = makeService({
      config: { ...DEFAULT_CONFIG.ai, provider: 'anthropic' },
      env: { ANTHROPIC_API_KEY: 'k' },
      model,
    });
    const p = service.runAgent({ prompt: 'p', runId: 'r5' });
    await new Promise((r) => setTimeout(r, 50)); // let the first chunk stream, then stop
    service.stop('r5');
    await p;
    expect(abortAfter).toHaveBeenCalled();
    const done = events.find((e) => e.type === 'ai:done') as { aborted: boolean };
    expect(done.aborted).toBe(true);
    // nothing after the abort: the late delta never reached the UI
    const messages = events.filter((e) => e.type === 'ai:message');
    expect(messages).toHaveLength(1);
    expect((messages[0] as { text: string }).text).toBe('first chunk');
  });

  it('AC-6: a model that always calls a tool stops at exactly maxSteps, incomplete, no extra call', async () => {
    const calls: number[] = [];
    const script = [
      { type: 'stream-start', warnings: [] },
      ...toolCallStep('search_knowledge_base', { query: 'q' }),
      finish('tool-calls', 10, 5),
    ];
    const { service, events } = makeService({
      config: { ...DEFAULT_CONFIG.ai, provider: 'anthropic' },
      env: { ANTHROPIC_API_KEY: 'k' },
      model: fakeModel({ calls, script }),
      tools: { search_knowledge_base: kbTool([{ query: 'q', count: 0, results: [] }]) },
    });
    await service.runAgent({ prompt: 'p', runId: 'r', options: { maxSteps: 3 } });
    const toolCalls = events.filter((e) => e.type === 'ai:tool-call');
    expect(toolCalls).toHaveLength(3); // exactly maxSteps, no 4th
    const done = events.find((e) => e.type === 'ai:done') as { incomplete: boolean; aborted: boolean };
    expect(done.incomplete).toBe(true);
    expect(done.aborted).toBe(false);
    expect(events.filter((e) => e.type === 'ai:done')).toHaveLength(1);
  });

  it('AC-8: a tool result that is not valid against its schema degrades to a safe string', async () => {
    const script = [
      { type: 'stream-start', warnings: [] },
      ...toolCallStep('search_knowledge_base', { query: 'x' }),
      finish('tool-calls', 10, 5),
      { type: 'stream-start', warnings: [] },
      ...textStep('t', 'done'),
      finish('stop', 12, 6),
    ];
    const { service, events } = makeService({
      config: { ...DEFAULT_CONFIG.ai, provider: 'anthropic' },
      env: { ANTHROPIC_API_KEY: 'k' },
      model: fakeModel({ script }),
      tools: { search_knowledge_base: kbTool([]) }, // returns an object, not a string
    });
    await service.runAgent({ prompt: 'p', runId: 'r' });
    const result = events.find((e) => e.type === 'ai:tool-result') as { output: string };
    // The broadcast payload is always a bounded string (JSON-safe), never the raw object.
    expect(typeof result.output).toBe('string');
    expect(() => JSON.parse(result.output)).not.toThrow();
  });

  it('AC-8: a tool result that is malformed (wrong shape) degrades to a bounded string; no exception to the renderer', async () => {
    // A tool whose execute returns an object where a string is expected (the `aiToolResult`
    // schema requires `output: string`). The main process must degrade it to a safe, bounded
    // string — the renderer never receives the raw malformed object (AC-8).
    const badTool = {
      description: 'returns garbage',
      inputSchema: jsonSchema({ type: 'object', properties: { q: { type: 'string' } } }),
      execute: async () => ({ notAString: [1, 2, 3] }), // object, not a string
    };
    const script = [
      { type: 'stream-start', warnings: [] },
      ...toolCallStep('bad_tool', { q: 'x' }),
      finish('tool-calls', 10, 5),
      { type: 'stream-start', warnings: [] },
      ...textStep('t', 'done'),
      finish('stop', 12, 6),
    ];
    const { service, events } = makeService({
      config: { ...DEFAULT_CONFIG.ai, provider: 'anthropic' },
      env: { ANTHROPIC_API_KEY: 'k' },
      model: fakeModel({ script }),
      tools: { bad_tool: badTool },
    });
    await service.runAgent({ prompt: 'p', runId: 'r' });
    const result = events.find((e) => e.type === 'ai:tool-result') as { output: string } | undefined;
    // The broadcast payload is always a bounded, JSON-safe string — never the raw object.
    expect(result).toBeTruthy();
    expect(typeof result!.output).toBe('string');
    expect(() => JSON.parse(result!.output)).not.toThrow();
    // The malformed object was serialized, not passed through raw.
    expect(result!.output).toContain('notAString');
    // The run terminates cleanly with a terminal event (no unhandled exception).
    expect(events.some((e) => e.type === 'ai:done')).toBe(true);
  });
});
