import { create } from 'zustand';
import type { SpecDocument, SpecGateResult } from '@shared/types/specTickets';
import { useSpecTicketsStore } from './specTickets';

/** Pause in typing after which the draft is gated. */
export const DRAFT_GATE_DEBOUNCE_MS = 500;

let draftTimer: ReturnType<typeof setTimeout> | null = null;
// Each edit bumps this; a draft gate result is applied only if no edit happened meanwhile.
let draftSeq = 0;

interface DocEditorState {
  ticketId: string | null;
  doc: SpecDocument | null;
  /** The text the editor loaded or last saved; saves are checked against it on disk. */
  base: string;
  text: string;
  dirty: boolean;
  draftGate: SpecGateResult | null;
  checking: boolean;
  /** Disk content after a refused save; null when there is no conflict. */
  conflict: string | null;
  saving: boolean;
  error: string | null;

  open: (ticketId: string, doc: SpecDocument, content: string) => void;
  close: () => void;
  edit: (text: string) => void;
  save: (force?: boolean) => Promise<void>;
  reload: () => void;
  syncFromDisk: (ticketId: string, doc: SpecDocument, content: string) => void;
  /** True if it is fine to navigate away; asks first when there are unsaved edits, and closes on yes. */
  confirmLeave: () => boolean;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function cancelDraft(): void {
  if (draftTimer) clearTimeout(draftTimer);
  draftTimer = null;
  draftSeq++;
}

const CLOSED = {
  ticketId: null,
  doc: null,
  base: '',
  text: '',
  dirty: false,
  draftGate: null,
  checking: false,
  conflict: null,
  saving: false,
  error: null,
};

export const useDocEditorStore = create<DocEditorState>((set, get) => ({
  ...CLOSED,

  open: (ticketId, doc, content) => {
    cancelDraft();
    set({ ...CLOSED, ticketId, doc, base: content, text: content });
  },

  close: () => {
    cancelDraft();
    set(CLOSED);
  },

  edit: (text) => {
    const { ticketId, doc, base } = get();
    if (!ticketId || !doc) return;
    cancelDraft();
    const dirty = text !== base;
    // A previous result or error belongs to older text; drop it rather than show it as current.
    set({ text, dirty, draftGate: null, checking: false, error: null });
    if (!dirty) return;

    const seq = draftSeq;
    draftTimer = setTimeout(() => {
      set({ checking: true });
      window.cockpit.specTickets.draftGate(ticketId, doc, text).then(
        (draftGate) => {
          if (seq === draftSeq) set({ draftGate, checking: false });
        },
        (e: unknown) => {
          if (seq === draftSeq) set({ checking: false, error: message(e) });
        },
      );
    }, DRAFT_GATE_DEBOUNCE_MS);
  },

  save: async (force = false) => {
    const { ticketId, doc, text, base, saving } = get();
    if (!ticketId || !doc || saving) return;
    set({ saving: true, error: null });
    try {
      const r = await window.cockpit.specTickets.saveDocument(ticketId, doc, text, base, force);
      if (r.status === 'conflict') {
        set({ saving: false, conflict: r.diskContent });
        return;
      }
      cancelDraft();
      // Edits typed while the save was in flight stay dirty.
      const current = get().text;
      set({ saving: false, base: r.content, dirty: current !== r.content, draftGate: null, checking: false, conflict: null });
    } catch (e: unknown) {
      set({ saving: false, error: message(e) });
      return;
    }
    await useSpecTicketsStore.getState().refresh();
  },

  reload: () => {
    const { conflict } = get();
    if (conflict === null) return;
    cancelDraft();
    set({ base: conflict, text: conflict, dirty: false, draftGate: null, checking: false, conflict: null });
  },

  syncFromDisk: (ticketId, doc, content) => {
    const s = get();
    if (s.ticketId !== ticketId || s.doc !== doc || s.dirty || content === s.base) return;
    set({ base: content, text: content });
  },

  confirmLeave: () => {
    const { dirty, doc, ticketId } = get();
    if (dirty && !window.confirm(`Discard unsaved changes to ${doc}.md of ${ticketId}?`)) return false;
    get().close();
    return true;
  },
}));
