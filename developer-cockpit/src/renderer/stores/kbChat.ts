import { create } from 'zustand';
import type { AiStatus, KbChatMessage, KbChatToolSource } from '@shared/types/ai';
import { KB_BUNDLE_PREFIX } from '@shared/kbPath';
import { extractSources, type KbChatToolEvent } from '@/lib/kbChatSources';
import { eventBus } from '@/lib/event-bus';

/** Earlier question/answer pairs sent with a new question (AC-6). */
export const KB_CHAT_HISTORY_TURNS = 10;

/** One turn of the conversation; an assistant turn carries the documents its tools used (AC-4). */
export interface KbChatTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  sources: string[];
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
      turns: s.turns.concat({ id: nextId(), role: 'user', text, sources: [] }, { id: nextId(), role: 'assistant', text: '', sources: [] }),
    }));
    try {
      const res = await ai.kbChat(runId, messages);
      if (!res.ok) {
        set({ running: false, activeRunId: null, error: res.message ?? 'Could not start the run.' });
        return;
      }
      set({ source: res.source ?? null });
    } catch (e) {
      set({ running: false, activeRunId: null, error: e instanceof Error ? e.message : 'Could not start the run.' });
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
        set((s) => ({ turns: withLast(s.turns, (t) => ({ ...t, text: t.text + String(event.text ?? '') })) }));
        break;
      case 'ai:tool-call':
      case 'ai:tool-result':
        set((s) => {
          const toolEvents = s.toolEvents.concat(event as KbChatToolEvent);
          return { toolEvents, turns: withLast(s.turns, (t) => ({ ...t, sources: extractSources(toolEvents) })) };
        });
        break;
      case 'ai:error':
        set({ error: String(event.message ?? 'The AI run failed.') });
        break;
      case 'ai:done':
        set({ running: false, activeRunId: null, incomplete: Boolean(event.incomplete) });
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
