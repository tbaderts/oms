// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useKbChatStore } from '../../src/renderer/stores/kbChat';
import { eventBus } from '../../src/renderer/lib/event-bus';
import type { KbChatMessage } from '../../src/shared/types/ai';

type KbChatFn = (runId: string, messages: KbChatMessage[]) => Promise<unknown>;
let kbChat: ReturnType<typeof vi.fn<KbChatFn>>;

beforeEach(() => {
  kbChat = vi.fn<KbChatFn>(async (runId) => ({ ok: true, runId, source: 'knowledge-server' }));
  (window as unknown as { cockpit: unknown }).cockpit = {
    ai: {
      available: async () => ({ available: true, provider: 'anthropic', model: 'm' }),
      kbChat,
      stop: vi.fn(async () => {}),
    },
  };
  useKbChatStore.getState().clear();
});

afterEach(() => {
  delete (window as unknown as { cockpit?: unknown }).cockpit;
});

/** Sends a question and answers it with `answer`, as the WebSocket events would. */
async function turn(question: string, answer: string) {
  await useKbChatStore.getState().send(question);
  const runId = useKbChatStore.getState().activeRunId!;
  const handle = useKbChatStore.getState().handleEvent;
  handle({ type: 'ai:message', runId, text: answer });
  handle({ type: 'ai:done', runId, aborted: false, incomplete: false });
}

const lastMessages = () => kbChat.mock.calls[kbChat.mock.calls.length - 1][1];

describe('kbChat store (SPEC-0062)', () => {
  it('follow-up carries earlier turns, bounded to 10 (AC-6)', async () => {
    await turn('q1', 'a1');
    await turn('q2', 'a2');
    expect(kbChat.mock.calls[0][1]).toEqual([{ role: 'user', content: 'q1' }]);
    expect(lastMessages()).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'q2' },
    ]);

    for (let i = 3; i <= 12; i++) await turn(`q${i}`, `a${i}`);
    await useKbChatStore.getState().send('q13');
    const sent = lastMessages();
    expect(sent).toHaveLength(21);
    expect(sent[0]).toEqual({ role: 'user', content: 'q3' }); // q1/a1 and q2/a2 dropped
    expect(sent[20]).toEqual({ role: 'user', content: 'q13' });
  });

  it('clear starts fresh (AC-6)', async () => {
    await turn('q1', 'a1');
    useKbChatStore.getState().clear();
    expect(useKbChatStore.getState().turns).toEqual([]);
    await useKbChatStore.getState().send('fresh');
    expect(lastMessages()).toEqual([{ role: 'user', content: 'fresh' }]);
  });

  it('collects sources from tool events of the active run (AC-4)', async () => {
    await useKbChatStore.getState().send('lifecycle?');
    const runId = useKbChatStore.getState().activeRunId!;
    const handle = useKbChatStore.getState().handleEvent;
    handle({ type: 'ai:tool-call', runId, toolCallId: 'c1', name: 'readKnowledgeBase', input: { path: 'oms-knowledge-base/domain/model/order.md' } });
    handle({ type: 'ai:tool-result', runId: 'other-run', toolCallId: 'x', name: 'searchKnowledgeBase', output: '`oms-knowledge-base/ignored.md`' });
    handle({ type: 'ai:message', runId, text: 'Answer.' });
    handle({ type: 'ai:done', runId, aborted: false, incomplete: false });
    const last = useKbChatStore.getState().turns.at(-1)!;
    expect(last).toMatchObject({ role: 'assistant', text: 'Answer.', sources: ['domain/model/order.md'] });
  });

  it('summarise names the document path (AC-5) and an error ends the run (AC-8)', async () => {
    await useKbChatStore.getState().summarise('domain/model/order.md', 'Order');
    expect(lastMessages()[0].content).toContain('oms-knowledge-base/domain/model/order.md');
    const runId = useKbChatStore.getState().activeRunId!;
    useKbChatStore.getState().handleEvent({ type: 'ai:error', runId, message: 'AI run failed: boom' });
    useKbChatStore.getState().handleEvent({ type: 'ai:done', runId, aborted: false, incomplete: false });
    expect(useKbChatStore.getState()).toMatchObject({ running: false, error: 'AI run failed: boom', activeRunId: null });
  });

  it('a run finishes even when no panel is mounted (events reach the store directly)', async () => {
    await useKbChatStore.getState().send('q while the panel is closed');
    const runId = useKbChatStore.getState().activeRunId!;
    const emit = (payload: Record<string, unknown>) =>
      eventBus.emitForTest({ type: payload.type as string, timestamp: Date.now(), payload } as never);
    emit({ type: 'ai:message', runId, text: 'answered in the background' });
    emit({ type: 'ai:done', runId, aborted: false, incomplete: false });
    expect(useKbChatStore.getState()).toMatchObject({ running: false, activeRunId: null });
    expect(useKbChatStore.getState().turns.at(-1)!.text).toBe('answered in the background');
  });

  it('an exchange whose answer is empty (failed run) is left out of the history', async () => {
    await useKbChatStore.getState().send('q1');
    const runId = useKbChatStore.getState().activeRunId!;
    useKbChatStore.getState().handleEvent({ type: 'ai:error', runId, message: 'boom' });
    useKbChatStore.getState().handleEvent({ type: 'ai:done', runId, aborted: false, incomplete: false });
    await useKbChatStore.getState().send('q2');
    expect(lastMessages()).toEqual([{ role: 'user', content: 'q2' }]);
  });
});
