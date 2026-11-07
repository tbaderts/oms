import { create } from 'zustand';
import type { AiStatus } from '@shared/types/ai';

/** One transcript entry: a text message, a (summarized) tool call, or a tool result. */
export interface TranscriptEntry {
  id: string;
  kind: 'message' | 'tool-call' | 'tool-result';
  /** message: the streamed text; tool-call/result: the tool name. */
  text: string;
  /** tool-call: the tool's input; tool-result: the summarized output. */
  detail?: string;
}

interface AssistantState {
  /** `ai:available` status, refreshed on mount (AC-1/AC-9). */
  status: AiStatus | null;
  /** The run whose events belong to the current transcript; null when idle. */
  activeRunId: string | null;
  running: boolean;
  incomplete: boolean;
  error: string | null;
  entries: TranscriptEntry[];

  loadStatus: () => Promise<void>;
  start: (prompt: string) => Promise<void>;
  stop: () => void;
  /** Handles one `ai:*` event; applies it only when it belongs to the current run. */
  handleEvent: (event: AiEventLike) => void;
  clear: () => void;
}

/** The event shape the renderer receives (the `ai:*` WebSocket payload, typed loosely to avoid a cycle). */
type AiEventLike = { type: string; runId: string } & Record<string, unknown>;

let entrySeq = 0;
const nextId = () => `e${++entrySeq}`;
let runSeq = 0;
const nextRunId = () => `run-${Date.now()}-${++runSeq}`;

/** Appends a streamed text chunk to the last message entry (or starts one). */
function appendMessage(entries: TranscriptEntry[], text: string): TranscriptEntry[] {
  const last = entries[entries.length - 1];
  if (last && last.kind === 'message') {
    return entries.slice(0, -1).concat({ ...last, text: last.text + text });
  }
  return entries.concat({ id: nextId(), kind: 'message', text });
}

export const useAssistantStore = create<AssistantState>((set, get) => ({
  status: null,
  activeRunId: null,
  running: false,
  incomplete: false,
  error: null,
  entries: [],

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

  start: async (prompt) => {
    const ai = window.cockpit?.ai;
    if (!ai) {
      set({ error: 'The AI feature is not available in this build.' });
      return;
    }
    const runId = nextRunId();
    set({ activeRunId: runId, running: true, error: null, incomplete: false, entries: [{ id: nextId(), kind: 'message', text: prompt }] });
    try {
      await ai.run(runId, prompt);
    } catch (e) {
      // A start failure is surfaced through the status error; the transcript keeps the prompt.
      set({ running: false, error: e instanceof Error ? e.message : 'Could not start the run.' });
    }
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
        set((s) => ({ entries: appendMessage(s.entries, String(event.text ?? '')) }));
        break;
      case 'ai:tool-call':
        set((s) => ({
          entries: s.entries.concat({
            id: nextId(),
            kind: 'tool-call',
            text: String(event.name ?? 'tool'),
            detail: JSON.stringify(event.input ?? {}),
          }),
        }));
        break;
      case 'ai:tool-result':
        set((s) => ({
          entries: s.entries.concat({
            id: nextId(),
            kind: 'tool-result',
            text: String(event.name ?? 'tool'),
            detail: String(event.output ?? ''),
          }),
        }));
        break;
      case 'ai:done':
        set({ running: false, incomplete: Boolean(event.incomplete), activeRunId: null });
        break;
      case 'ai:error':
        set((s) => ({
          running: false,
          error: String(event.message ?? 'The AI run failed.'),
          activeRunId: s.error ? s.activeRunId : null,
        }));
        break;
      default:
        break;
    }
  },

  clear: () => set({ entries: [], activeRunId: null, running: false, error: null, incomplete: false }),
}));
