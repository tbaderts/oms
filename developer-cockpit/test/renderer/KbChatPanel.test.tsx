// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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
      output: '### 1. `oms-knowledge-base/domain/concepts/order-lifecycle.md#states`\n### 2. `oms-knowledge-base/domain/concepts/order-lifecycle.md#cancel`',
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
    expect(messages.at(-1)!.content).toContain('oms-knowledge-base/domain/concepts/order-lifecycle.md');
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
