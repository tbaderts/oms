import { create } from 'zustand';
import type {
  SpecAction,
  SpecActionResult,
  SpecTicketDetail,
  SpecTicketLoadError,
  SpecTicketSummary,
} from '@shared/types/specTickets';
import { type StageFilter } from '../lib/spec-tickets';
import { useDocEditorStore } from './docEditor';

interface SpecTicketsState {
  tickets: SpecTicketSummary[];
  user: string;
  types: string[];
  errors: SpecTicketLoadError[];
  showArchived: boolean;
  mineOnly: boolean;
  stage: StageFilter;
  module: string;
  text: string;
  selectedId: string | null;
  detail: SpecTicketDetail | null;
  loading: boolean;
  error: string | null;
  running: boolean;
  lastResult: SpecActionResult | null;
  /** Ticket the last result belongs to; null for "new", which has no ticket yet. */
  lastResultFor: string | null;

  load: () => Promise<void>;
  select: (id: string | null) => Promise<void>;
  refresh: () => Promise<void>;
  /** Runs a CLI action; resolves with the id of a newly created ticket (which is then selected), else null. */
  run: (action: SpecAction) => Promise<string | null>;
  setFilter: (f: Partial<Pick<SpecTicketsState, 'mineOnly' | 'stage' | 'module' | 'text'>>) => void;
  /** Applies a stage view from the dashboard; like the donut, it shows everyone's tickets. */
  applyStageFilter: (stage: StageFilter) => void;
  /** Toggles a stage view off when it is already the filter; '' always clears it. */
  toggleStageFilter: (stage: StageFilter) => void;
  setShowArchived: (showArchived: boolean) => Promise<void>;
}

// Overlapping loads (an action's refresh plus watcher events): only the latest response is applied.
let loadSeq = 0;

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const useSpecTicketsStore = create<SpecTicketsState>((set, get) => ({
  tickets: [],
  user: '',
  types: [],
  errors: [],
  showArchived: false,
  mineOnly: true,
  stage: '',
  module: '',
  text: '',
  selectedId: null,
  detail: null,
  loading: false,
  error: null,
  running: false,
  lastResult: null,
  lastResultFor: null,

  load: async () => {
    const seq = ++loadSeq;
    set({ loading: true, error: null });
    try {
      const list = await window.cockpit.specTickets.list(get().showArchived);
      if (seq !== loadSeq) return;
      set({ tickets: list.tickets, user: list.user, types: list.types ?? [], errors: list.errors, loading: false });
    } catch (e: unknown) {
      if (seq === loadSeq) set({ loading: false, error: message(e) });
    }
  },

  select: async (id) => {
    // Unsaved document edits are discarded only after the user confirms.
    if (id !== get().selectedId && !useDocEditorStore.getState().confirmLeave()) return;
    const { lastResultFor } = get();
    set({
      selectedId: id,
      detail: id && get().detail?.id === id ? get().detail : null,
      // Keep a "new ticket" result and the selected ticket's own result; drop another ticket's.
      ...(lastResultFor !== null && lastResultFor !== id ? { lastResult: null, lastResultFor: null } : {}),
    });
    if (!id) return;
    try {
      const detail = await window.cockpit.specTickets.get(id);
      // Only apply if the selection did not change meanwhile
      if (get().selectedId === id) set({ detail });
    } catch (e: unknown) {
      set({ error: message(e) });
    }
  },

  refresh: async () => {
    const { selectedId } = get();
    await get().load();
    if (!selectedId) return;
    if (!get().error && !get().tickets.some((t) => t.id === selectedId)) {
      // The open ticket was removed (or archived while archived tickets are hidden).
      if (get().selectedId === selectedId) set({ selectedId: null, detail: null });
      return;
    }
    try {
      const detail = await window.cockpit.specTickets.get(selectedId);
      if (get().selectedId === selectedId) set({ detail });
    } catch (e: unknown) {
      set({ error: message(e) });
    }
  },

  run: async (action) => {
    if (get().running) return null;
    const lastResultFor = action.kind === 'new' ? null : action.id;
    set({ running: true, lastResult: null, lastResultFor, error: null });
    let created: string | null = null;
    let actionError: string | null = null;
    try {
      const lastResult = await window.cockpit.specTickets.run(action);
      set({ lastResult });
      if (action.kind === 'new' && lastResult.exitCode === 0) {
        created = lastResult.stdout.match(/Created (SPEC-\d{4})/)?.[1] ?? null;
      }
    } catch (e: unknown) {
      actionError = message(e);
      set({ error: actionError });
    } finally {
      set({ running: false });
    }
    await get().refresh();
    // load() clears `error`; an action failure must survive the refresh that follows it.
    if (actionError && !get().error) set({ error: actionError });
    if (created) await get().select(created);
    // The unsaved-edit guard may have kept the previous selection; then there is nothing to open.
    return created && get().selectedId === created ? created : null;
  },

  setFilter: (f) => set(f),

  applyStageFilter: (stage) => set({ stage, mineOnly: false }),

  toggleStageFilter: (stage) => {
    const { stage: current } = get();
    set({ stage: current === stage ? '' : stage, mineOnly: false });
  },

  setShowArchived: async (showArchived) => {
    set({ showArchived });
    await get().load();
  },
}));
