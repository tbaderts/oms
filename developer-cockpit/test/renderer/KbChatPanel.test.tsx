// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { KbChatPanel } from '../../src/renderer/views/knowledge-base/KbChatPanel';
import { useKbChatStore } from '../../src/renderer/stores/kbChat';
import { useKnowledgeBaseStore } from '../../src/renderer/stores/knowledgeBase';
import { eventBus } from '../../src/renderer/lib/event-bus';
import type { AiEvent, KbChatMessage } from '../../src/shared/types/ai';
import type { CockpitEvent } from '../../src/shared/types/events';
import type { KbDocument } from '../../src/shared/types/kb';

type KbChatFn = (runId: string, messages: KbChatMessage[]) => Promise<unknown>;

function installCockpit(opts: { available?: boolean; source?: 'knowledge-server' | 'local' } = {}) {
  const kbChat = vi.fn<KbChatFn>(async (runId) => ({ ok: true, runId, source: opts.source ?? 'knowledge-server' }));
  const stop = vi.fn(async () => {});
  const getDocument = vi.fn(async (p: string) => doc(p));
  (window as unknown as { cockpit: unknown }).cockpit = {
    ai: {
      available: async () =>
        opts.available === false
          ? { available: false, provider: 'anthropic', reason: 'AI not configured: the ANTHROPIC_API_KEY environment variable is not set.' }
          : { available: true, provider: 'anthropic', model: 'm' },
      kbChat,
      stop,
    },
    kb: { getDocument },
  };
  return { kbChat, stop, getDocument };
}

const doc = (relPath: string): KbDocument => ({
  path: `/kb/${relPath}`,
  relativePath: relPath,
  title: 'Order lifecycle',
  category: 'domain',
  folder: 'domain/concepts',
  content: '# Order lifecycle',
  frontmatter: {},
  lastModified: 0,
});

function emit(event: AiEvent) {
  act(() => {
    eventBus.emitForTest({ type: event.type, timestamp: Date.now(), payload: event } as CockpitEvent<AiEvent>);
  });
}

const input = () => screen.getByLabelText('Knowledge base question') as HTMLInputElement;

async function ask(question: string) {
  fireEvent.change(input(), { target: { value: question } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
  });
}

const runId = () => useKbChatStore.getState().activeRunId!;

afterEach(() => {
  cleanup();
  eventBus.disconnect();
  useKbChatStore.setState(useKbChatStore.getInitialState(), true);
  useKnowledgeBaseStore.setState({ selectedDocument: null });
});

describe('KbChatPanel (SPEC-0062)', () => {
  it('sends a question and shows the streamed answer (AC-1)', async () => {
    const { kbChat } = installCockpit();
    render(<KbChatPanel />);
    await vi.waitFor(() => expect(input().disabled).toBe(false));

    await ask('What are the order states?');
    expect(kbChat).toHaveBeenCalledWith(expect.stringMatching(/^kbchat-/), [{ role: 'user', content: 'What are the order states?' }]);
    expect(input().disabled).toBe(true);

    const id = runId();
    emit({ type: 'ai:message', runId: id, text: 'There are ' });
    emit({ type: 'ai:message', runId: id, text: 'six states.' });
    emit({ type: 'ai:done', runId: id, aborted: false, incomplete: false });
    expect(screen.getByTestId('kb-chat-answer').textContent).toContain('There are six states.');
    expect(input().disabled).toBe(false);
  });

  it('shows the fallback notice (AC-3)', async () => {
    installCockpit({ source: 'local' });
    render(<KbChatPanel />);
    await vi.waitFor(() => expect(input().disabled).toBe(false));
    expect(screen.queryByTestId('kb-chat-fallback')).toBeNull();
    await ask('anything');
    expect(screen.getByTestId('kb-chat-fallback').textContent).toBe('Knowledge server unavailable — using local search');
  });

  it('lists sources and opens one in the viewer (AC-4)', async () => {
    const { getDocument } = installCockpit();
    render(<KbChatPanel />);
    await vi.waitFor(() => expect(input().disabled).toBe(false));
    await ask('lifecycle?');
    const id = runId();
    emit({ type: 'ai:tool-call', runId: id, toolCallId: 'c1', name: 'searchKnowledgeBase', input: { query: 'lifecycle' } });
    emit({
      type: 'ai:tool-result',
      runId: id,
      toolCallId: 'c1',
      name: 'searchKnowledgeBase',
      output: '### 1. `knowledge-base/domain/concepts/order-lifecycle.md#states`\n### 2. `knowledge-base/domain/concepts/order-lifecycle.md#cancel`',
    });
    emit({ type: 'ai:message', runId: id, text: 'See the lifecycle.' });
    emit({ type: 'ai:done', runId: id, aborted: false, incomplete: false });

    const links = screen.getAllByRole('button', { name: /^Open source / });
    expect(links.map((l) => l.textContent)).toEqual(['domain/concepts/order-lifecycle.md']);
    await act(async () => {
      fireEvent.click(links[0]);
    });
    expect(getDocument).toHaveBeenCalledWith('domain/concepts/order-lifecycle.md');
    await vi.waitFor(() => expect(useKnowledgeBaseStore.getState().selectedDocument?.relativePath).toBe('domain/concepts/order-lifecycle.md'));
  });

  it('summarises the open document (AC-5)', async () => {
    const { kbChat } = installCockpit();
    useKnowledgeBaseStore.setState({ selectedDocument: doc('domain/concepts/order-lifecycle.md') });
    render(<KbChatPanel />);
    const button = await screen.findByRole('button', { name: /Summarise this document/ });
    await vi.waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    await act(async () => {
      fireEvent.click(button);
    });
    const messages = kbChat.mock.calls[0][1];
    expect(messages.at(-1)!.content).toContain('knowledge-base/domain/concepts/order-lifecycle.md');
    emit({ type: 'ai:message', runId: runId(), text: 'Summary: orders move through states.' });
    emit({ type: 'ai:done', runId: runId(), aborted: false, incomplete: false });
    expect(screen.getByTestId('kb-chat-answer').textContent).toContain('Summary: orders move through states.');
  });

  it('is disabled when AI is not configured (AC-7)', async () => {
    const { kbChat } = installCockpit({ available: false });
    render(<KbChatPanel />);
    expect((await screen.findByTestId('kb-chat-not-configured')).textContent).toContain('Settings → AI');
    expect(input().disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Send question' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(kbChat).not.toHaveBeenCalled();
  });

  it('shows an error and re-enables input; Stop stops the run (AC-8)', async () => {
    const { stop } = installCockpit();
    render(<KbChatPanel />);
    await vi.waitFor(() => expect(input().disabled).toBe(false));

    await ask('first');
    const first = runId();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    });
    expect(stop).toHaveBeenCalledWith(first);
    emit({ type: 'ai:done', runId: first, aborted: true, incomplete: false });
    expect(input().disabled).toBe(false);

    await ask('second');
    const second = runId();
    emit({ type: 'ai:error', runId: second, message: 'AI run failed: provider exploded' });
    emit({ type: 'ai:done', runId: second, aborted: false, incomplete: false });
    expect(screen.getByTestId('kb-chat-error').textContent).toBe('AI run failed: provider exploded');
    expect(input().disabled).toBe(false);
  });
});

describe('Knowledge Base view: document and chat take turns in the centre', () => {
  // The test document repeats its title as a heading, so the viewer shows two.
  const docShown = () => screen.queryAllByRole('heading', { level: 1, name: 'Order lifecycle' }).length > 0;

  it('switches between the document and the chat, keeping the conversation', async () => {
    const { KnowledgeBaseView } = await import('../../src/renderer/views/knowledge-base/KnowledgeBaseView');
    installCockpit();
    Object.assign((window as unknown as { cockpit: { kb: object } }).cockpit.kb, { getCategories: vi.fn(async () => []) });
    useKnowledgeBaseStore.setState({ selectedDocument: doc('domain/concepts/order-lifecycle.md') });
    render(<KnowledgeBaseView />);

    // The document fills the centre; there is no chat beside it.
    await vi.waitFor(() => expect(docShown()).toBe(true));
    expect(screen.queryByTestId('kb-chat-panel')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Chat' }));
    expect(screen.getByRole('button', { name: 'Chat' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('kb-chat-panel')).toBeTruthy();
    expect(docShown()).toBe(false);
    await vi.waitFor(() => expect(input().disabled).toBe(false));
    await ask('lifecycle?');
    emit({ type: 'ai:message', runId: runId(), text: 'See the lifecycle.' });
    emit({ type: 'ai:done', runId: runId(), aborted: false, incomplete: false });

    fireEvent.click(screen.getByRole('button', { name: 'Document' }));
    expect(screen.queryByTestId('kb-chat-panel')).toBeNull();
    expect(docShown()).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Chat' }));
    expect(screen.getByTestId('kb-chat-answer').textContent).toContain('See the lifecycle.');
  });

  it('opening a source from the chat shows that document', async () => {
    const { KnowledgeBaseView } = await import('../../src/renderer/views/knowledge-base/KnowledgeBaseView');
    const { getDocument } = installCockpit();
    Object.assign((window as unknown as { cockpit: { kb: object } }).cockpit.kb, { getCategories: vi.fn(async () => []) });
    render(<KnowledgeBaseView />);
    fireEvent.click(screen.getByRole('button', { name: 'Chat' }));
    await vi.waitFor(() => expect(input().disabled).toBe(false));
    await ask('lifecycle?');
    const id = runId();
    emit({ type: 'ai:tool-call', runId: id, toolCallId: 'c1', name: 'searchKnowledgeBase', input: { query: 'lifecycle' } });
    emit({ type: 'ai:tool-result', runId: id, toolCallId: 'c1', name: 'searchKnowledgeBase', output: '### 1. `knowledge-base/domain/concepts/order-lifecycle.md#states`' });
    emit({ type: 'ai:message', runId: id, text: 'See the lifecycle.' });
    emit({ type: 'ai:done', runId: id, aborted: false, incomplete: false });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Open source / }));
    });
    expect(getDocument).toHaveBeenCalledWith('domain/concepts/order-lifecycle.md');
    await vi.waitFor(() => expect(docShown()).toBe(true));
    expect(screen.queryByTestId('kb-chat-panel')).toBeNull();
    expect(screen.getByRole('button', { name: 'Document' }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('KB chat source and run details (SPEC-0065)', () => {
  const SEARCH = [
    '## Knowledge base search: "cancel"',
    '### 1. `knowledge-base/domain/concepts/order-lifecycle.md#cancellation`',
    '**Order Lifecycle › Cancellation** (lines 40-58) — Domain Concept · stable · human-reviewed — score 0.0325 · keyword #1 · semantic #2',
    '',
    '> A cancel request moves the order to PendingCancel.',
    '',
  ].join('\n');

  type RunOptions = { tool?: string; input?: Record<string, unknown>; output?: string; done?: Record<string, unknown>; error?: string };

  /** Asks, then plays one run: some text, one tool call with its result, the answer, done. */
  async function answer(opts: RunOptions = {}) {
    await ask('cancel?');
    const id = runId();
    const tool = opts.tool ?? 'searchKnowledgeBase';
    emit({ type: 'ai:message', runId: id, text: 'Searching. ' });
    emit({ type: 'ai:tool-call', runId: id, toolCallId: 'c1', name: tool, input: opts.input ?? { query: 'cancel' } });
    emit({ type: 'ai:tool-result', runId: id, toolCallId: 'c1', name: tool, output: opts.output ?? SEARCH });
    emit({ type: 'ai:message', runId: id, text: 'Orders move to PendingCancel.' });
    if (opts.error) emit({ type: 'ai:error', runId: id, message: opts.error });
    emit({
      type: 'ai:done',
      runId: id,
      aborted: false,
      incomplete: false,
      model: { provider: 'anthropic', model: 'claude-test' },
      usage: { inputTokens: 1200, outputTokens: 300 },
      ...opts.done,
    } as AiEvent);
  }

  async function ready() {
    installCockpit();
    render(<KbChatPanel />);
    await vi.waitFor(() => expect(input().disabled).toBe(false));
  }

  const toggle = (name: RegExp, index = 0) => screen.getAllByRole('button', { name })[index];

  const ORDER_LIFECYCLE = 'domain/concepts/order-lifecycle.md';
  /** The source entry (list item) of a path in the Sources list. */
  const entry = (path: string) => screen.getByRole('button', { name: `Open source ${path}` }).closest('li')!;

  it('details are closed by default (AC-8)', async () => {
    await ready();
    await answer();
    expect(toggle(/^Show matches for /).getAttribute('aria-expanded')).toBe('false');
    expect(toggle(/^Run details/).getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('kb-chat-source-matches')).toBeNull();
    expect(screen.queryByText(/A cancel request moves the order/)).toBeNull();
    expect(screen.queryByText(/claude-test/)).toBeNull();
    // The existing source link is still there, and there is no separate section.
    expect(screen.getByRole('button', { name: `Open source ${ORDER_LIFECYCLE}` }).textContent).toBe(ORDER_LIFECYCLE);
    expect(screen.queryByRole('button', { name: /^Source details/ })).toBeNull();
  });

  it('each source shows its best match, and its toggle lists every match (AC-1)', async () => {
    await ready();
    const twoHits = [
      SEARCH.trimEnd(),
      '### 2. `knowledge-base/domain/concepts/order-lifecycle.md#states`',
      '**Order Lifecycle › States** (lines 5-20) — Domain Concept · stable · human-reviewed — score 0.0161 · keyword #4',
      '',
      '> The states of an order.',
    ].join('\n');
    await answer({ output: twoHits });

    // The summary of the best match sits next to the link.
    expect(entry(ORDER_LIFECYCLE).textContent).toContain('#1 · score 0.0325 · Cancellation (lines 40-58) · Domain Concept · stable · human-reviewed');

    fireEvent.click(screen.getByRole('button', { name: `Show matches for ${ORDER_LIFECYCLE}` }));
    const matches = within(screen.getByTestId('kb-chat-source-matches')).getAllByRole('listitem').map((li) => li.textContent);
    expect(matches).toHaveLength(2);
    expect(matches[0]).toContain('#1 for "cancel" · score 0.0325 · keyword #1 · semantic #2');
    expect(matches[0]).toContain('Order Lifecycle › Cancellation · #cancellation · lines 40-58 · Domain Concept · stable · human-reviewed');
    expect(matches[0]).toContain('A cancel request moves the order to PendingCancel.');
    expect(matches[1]).toContain('#2 for "cancel" · score 0.0161 · keyword #4');
    expect(matches[1]).toContain('The states of an order.');
  });

  it('details from the server text as it was JSON-encoded (AC-10)', async () => {
    await ready();
    // What the knowledge server sent before SPEC-0065, had it reached the renderer undecoded, with
    // the server's real breadcrumb separator (" > ").
    const real = SEARCH.replace('Order Lifecycle › Cancellation', 'order-lifecycle.md > Order Lifecycle > Cancellation');
    await answer({ output: JSON.stringify(real) });
    expect(entry(ORDER_LIFECYCLE).textContent).toContain('#1 · score 0.0325 · Cancellation (lines 40-58)');
    fireEvent.click(toggle(/^Run details/));
    fireEvent.click(within(screen.getByTestId('kb-chat-run-details')).getByRole('button', { name: /Result/ }));
    const result = screen.getByTestId('kb-chat-run-details').querySelector('pre')!.textContent!;
    expect(result.startsWith('## Knowledge base search: "cancel"\n### 1.')).toBe(true);
  });

  it('local sources show rank and distance, and a read document shows read (AC-2)', async () => {
    await ready();
    await ask('order?');
    const id = runId();
    const results = JSON.stringify({ query: 'order', count: 1, results: [{ title: 'Order', path: 'domain/model/order.md', category: 'domain', score: 0.123456 }] });
    emit({ type: 'ai:tool-call', runId: id, toolCallId: 's', name: 'search_knowledge_base', input: { query: 'order' } });
    emit({ type: 'ai:tool-result', runId: id, toolCallId: 's', name: 'search_knowledge_base', output: results });
    emit({ type: 'ai:tool-call', runId: id, toolCallId: 'r', name: 'read_knowledge_base_document', input: { path: 'tools/developer-cockpit.md' } });
    emit({ type: 'ai:tool-result', runId: id, toolCallId: 'r', name: 'read_knowledge_base_document', output: '# Developer Cockpit' });
    emit({ type: 'ai:done', runId: id, aborted: false, incomplete: false });
    expect(entry('domain/model/order.md').textContent).toContain('#1 · distance 0.123 (lower is better)');
    expect(entry('tools/developer-cockpit.md').textContent).toContain('read');
    fireEvent.click(screen.getByRole('button', { name: 'Show matches for domain/model/order.md' }));
    expect(screen.getByTestId('kb-chat-source-matches').textContent).toContain('#1 for "order" · distance 0.123 (lower is better) · domain');
  });

  it('run details show model, tokens, tool calls, duration and steps (AC-5)', async () => {
    await ready();
    await answer();
    fireEvent.click(toggle(/^Run details/));
    const run = screen.getByTestId('kb-chat-run-details');
    expect(run.textContent).toMatch(/anthropic \/ claude-test · 1,200 in \+ 300 out = 1,500 tokens · 1 tool call · \d+\.\d s · complete/);
    const steps = within(run).getAllByRole('listitem').map((li) => li.textContent);
    expect(steps[0]).toContain('Searching.');
    expect(steps[1]).toContain('searchKnowledgeBase({"query":"cancel"})');
    expect(steps[2]).toContain('Orders move to PendingCancel.');
    // The result is collapsed until asked for.
    expect(within(run).queryByText(/Knowledge base search/)).toBeNull();
    fireEvent.click(within(run).getByRole('button', { name: /Result/ }));
    expect(within(run).getByText(/Knowledge base search/)).toBeTruthy();
  });

  it('run details without usage say not reported (AC-5)', async () => {
    await ready();
    await answer({ done: { usage: undefined, model: undefined } });
    fireEvent.click(toggle(/^Run details/));
    expect(screen.getByTestId('kb-chat-run-details').textContent).toContain('tokens not reported');
  });

  it('run details show stopped, step limit and failed outcomes (AC-6)', async () => {
    await ready();
    await answer({ done: { aborted: true } });
    await answer({ done: { incomplete: true } });
    await answer({ error: 'AI run failed: provider exploded' });
    const outcomes = [0, 1, 2].map((i) => {
      fireEvent.click(toggle(/^Run details/, i));
      return screen.getAllByTestId('kb-chat-run-details')[i].textContent;
    });
    expect(outcomes[0]).toContain('stopped');
    expect(outcomes[1]).toContain('step limit');
    expect(outcomes[2]).toContain('failed: AI run failed: provider exploded');
    // Each run lists its steps up to where it ended.
    for (const outcome of outcomes) expect(outcome).toContain('searchKnowledgeBase(');
  });

  it('each answer keeps its own run details; clear removes them (AC-7)', async () => {
    await ready();
    await answer();
    await answer({
      tool: 'readKnowledgeBase',
      input: { path: 'domain/model/order.md', anchor: 'states' },
      output: '## `x`',
      done: { model: { provider: 'openai', model: 'gpt-test' } },
    });
    fireEvent.click(toggle(/^Run details/, 0));
    const first = screen.getAllByTestId('kb-chat-run-details')[0];
    expect(first.textContent).toContain('claude-test');
    expect(first.textContent).toContain('searchKnowledgeBase(');
    expect(first.textContent).not.toContain('readKnowledgeBase(');
    // The second answer's source was read with an anchor (AC-3).
    expect(entry('domain/model/order.md').textContent).toContain('read #states');

    fireEvent.click(screen.getByRole('button', { name: 'Clear the conversation' }));
    expect(screen.queryAllByRole('button', { name: /^(Run details|Show matches for )/ })).toEqual([]);
  });
});
