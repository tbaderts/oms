import { create } from 'zustand';
import type { AiStatus, KbChatMessage, KbChatToolSource } from '@shared/types/ai';
import { KB_BUNDLE_PREFIX } from '@shared/kbPath';
import { extractSources, type KbChatToolEvent } from '@/lib/kbChatSources';
import type { KbChatStep, KbChatTrace } from '@/lib/kbChatTrace';
import { eventBus } from '@/lib/event-bus';

/** Earlier question/answer pairs sent with a new question (AC-6). */
export const KB_CHAT_HISTORY_TURNS = 10;

/** One turn of the conversation; an assistant turn carries the documents its tools used (AC-4). */
export interface KbChatTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  sources: string[];
  /** An assistant turn's run: steps, model, usage, outcome and timing (SPEC-0065). */
  trace?: KbChatTrace;
}

type AiEventLike = { type: string; runId: string } & Record<string, unknown>;

interface KbChatState {
  status: AiStatus | null;
  /** The run whose events fill the last assistant turn; null when idle. */
  activeRunId: string | null;
  running: boolean;
  incomplete: boolean;
  error: string | null;
  /** Which tools the last run used; `local` means the knowledge server was unreachable (AC-3). */
  source: KbChatToolSource | null;
  turns: KbChatTurn[];
  /** Tool events of the active run, the input of source extraction. */
  toolEvents: KbChatToolEvent[];

  loadStatus: () => Promise<void>;
  send: (question: string) => Promise<void>;
  summarise: (path: string, title: string) => Promise<void>;
  stop: () => void;
  handleEvent: (event: AiEventLike) => void;
  clear: () => void;
}

let seq = 0;
const nextId = () => `kb-turn-${++seq}`;
const nextRunId = () => `kbchat-${Date.now()}-${++seq}`;

/**
 * The conversation sent to the model: completed question/answer pairs (an exchange whose answer is
 * empty, e.g. a failed run, is left out), the last KB_CHAT_HISTORY_TURNS of them, plus the new
 * question (AC-6).
 */
function history(turns: KbChatTurn[], question: string): KbChatMessage[] {
  const pairs: KbChatMessage[][] = [];
  for (let i = 0; i + 1 < turns.length; i++) {
    const q = turns[i];
    const a = turns[i + 1];
    if (q.role === 'user' && a.role === 'assistant' && q.text.trim() && a.text.trim()) {
      pairs.push([{ role: 'user', content: q.text }, { role: 'assistant', content: a.text }]);
      i++;
    }
  }
  return [...pairs.slice(-KB_CHAT_HISTORY_TURNS).flat(), { role: 'user', content: question }];
}

/** Updates the trace of the last (assistant) turn (SPEC-0065). */
function withTrace(turns: KbChatTurn[], update: (t: KbChatTrace) => KbChatTrace): KbChatTurn[] {
  return withLast(turns, (t) => (t.trace ? { ...t, trace: update(t.trace) } : t));
}

/** Appends streamed text to the last text step, or starts one after a tool call. */
function addText(steps: KbChatStep[], text: string): KbChatStep[] {
  const last = steps[steps.length - 1];
  return last?.kind === 'text'
    ? steps.slice(0, -1).concat({ kind: 'text', text: last.text + text })
    : steps.concat({ kind: 'text', text });
}

/** Sets a tool result on its call; a result without a call gets a step of its own. */
function addResult(steps: KbChatStep[], toolCallId: string, name: string, output: string): KbChatStep[] {
  const i = steps.findIndex((s) => s.kind === 'tool' && s.toolCallId === toolCallId);
  if (i < 0) return steps.concat({ kind: 'tool', toolCallId, name, input: {}, output });
  return steps.map((s, j) => (j === i && s.kind === 'tool' ? { ...s, output } : s));
}

const failed = (message: string) => (t: KbChatTrace): KbChatTrace => ({ ...t, outcome: 'failed', error: message, endedAt: Date.now() });

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Replaces the last (assistant) turn. */
function withLast(turns: KbChatTurn[], update: (t: KbChatTurn) => KbChatTurn): KbChatTurn[] {
  const last = turns[turns.length - 1];
  return last && last.role === 'assistant' ? turns.slice(0, -1).concat(update(last)) : turns;
}

export const useKbChatStore = create<KbChatState>((set, get) => ({
  status: null,
  activeRunId: null,
  running: false,
  incomplete: false,
  error: null,
  source: null,
  turns: [],
  toolEvents: [],

  loadStatus: async () => {
    const ai = window.cockpit?.ai;
    if (!ai) {
      set({ status: { available: false, provider: 'unknown', reason: 'The AI feature is not available in this build.' } });
      return;
    }
    try {
      set({ status: await ai.available() });
    } catch {
      set({ status: { available: false, provider: 'unknown', reason: 'Could not determine the AI status.' } });
    }
  },

  send: async (question) => {
    const text = question.trim();
    const ai = window.cockpit?.ai;
    if (!text || get().running) return;
    if (!ai) {
      set({ error: 'The AI feature is not available in this build.' });
      return;
    }
    const messages = history(get().turns, text);
    const runId = nextRunId();
    set((s) => ({
      activeRunId: runId,
      running: true,
      error: null,
      incomplete: false,
      toolEvents: [],
      turns: s.turns.concat(
        { id: nextId(), role: 'user', text, sources: [] },
        { id: nextId(), role: 'assistant', text: '', sources: [], trace: { steps: [], startedAt: Date.now(), outcome: 'running' } },
      ),
    }));
    try {
      const res = await ai.kbChat(runId, messages);
      if (!res.ok) {
        const message = res.message ?? 'Could not start the run.';
        set((s) => ({ running: false, activeRunId: null, error: message, turns: withTrace(s.turns, failed(message)) }));
        return;
      }
      set({ source: res.source ?? null });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not start the run.';
      set((s) => ({ running: false, activeRunId: null, error: message, turns: withTrace(s.turns, failed(message)) }));
    }
  },

  summarise: async (path, title) => {
    await get().send(`Summarise the knowledge base document \`${KB_BUNDLE_PREFIX}${path}\` ("${title}"). Read it first.`);
  },

  stop: () => {
    const { activeRunId } = get();
    const ai = window.cockpit?.ai;
    if (activeRunId && ai) void ai.stop(activeRunId).catch(() => {});
  },

  handleEvent: (event) => {
    const { activeRunId } = get();
    if (!activeRunId || event.runId !== activeRunId) return;
    switch (event.type) {
      case 'ai:message':
        set((s) => {
          const text = String(event.text ?? '');
          const turns = withLast(s.turns, (t) => ({ ...t, text: t.text + text }));
          return { turns: withTrace(turns, (tr) => ({ ...tr, steps: addText(tr.steps, text) })) };
        });
        break;
      case 'ai:tool-call':
      case 'ai:tool-result':
        set((s) => {
          const toolEvents = s.toolEvents.concat(event as KbChatToolEvent);
          const turns = withLast(s.turns, (t) => ({ ...t, sources: extractSources(toolEvents) }));
          const toolCallId = String(event.toolCallId ?? '');
          const name = String(event.name ?? '');
          return {
            toolEvents,
            turns: withTrace(turns, (tr) => ({
              ...tr,
              steps: event.type === 'ai:tool-call'
                ? tr.steps.concat({ kind: 'tool', toolCallId, name, input: asRecord(event.input) })
                : addResult(tr.steps, toolCallId, name, String(event.output ?? '')),
            })),
          };
        });
        break;
      case 'ai:error': {
        const message = String(event.message ?? 'The AI run failed.');
        set((s) => ({ error: message, turns: withTrace(s.turns, (tr) => ({ ...tr, error: message })) }));
        break;
      }
      case 'ai:done':
        set((s) => ({
          running: false,
          activeRunId: null,
          incomplete: Boolean(event.incomplete),
          turns: withTrace(s.turns, (tr) => ({
            ...tr,
            endedAt: Date.now(),
            ...(event.model ? { model: event.model as KbChatTrace['model'] } : {}),
            ...(event.usage ? { usage: event.usage as KbChatTrace['usage'] } : {}),
            outcome: event.aborted ? 'stopped' : event.incomplete ? 'step-limit' : tr.error ? 'failed' : 'complete',
          })),
        }));
        break;
      default:
        break;
    }
  },

  clear: () => set({ turns: [], toolEvents: [], activeRunId: null, running: false, error: null, incomplete: false }),
}));

/*
 * The store listens to the run's events itself, once, for the app's lifetime, so a run that
 * finishes while the chat panel is closed (or the KB view is left) still ends cleanly instead of
 * staying "running" with its input disabled. Events of other runs are ignored by runId.
 */
for (const type of ['ai:message', 'ai:tool-call', 'ai:tool-result', 'ai:done', 'ai:error'] as const) {
  eventBus.on(type, (e) => useKbChatStore.getState().handleEvent(e.payload as AiEventLike));
}
