import { create } from 'zustand';
import type { SpecTicketSummary } from '@shared/types/specTickets';
import { newestFirst, signalsOf, type Signal } from '@/lib/signals';

const MAX_TOASTS = 3;
const interrupts = (s: Signal) => s.level === 'critical' || s.level === 'attention';

interface SignalsState {
  /** False until the first successful ticket load; that load only seeds `known`. */
  initialized: boolean;
  known: Set<string>;
  /** Keys that arrived after the first load: the "new" marker in the feed. */
  fresh: Set<string>;
  /** New critical and attention signals not yet acknowledged, newest first. */
  unseen: Signal[];
  /** Toasts on screen, oldest first. */
  toasts: Signal[];
  ingest: (tickets: SpecTicketSummary[]) => void;
  markSeen: () => void;
  dismissToast: (key: string) => void;
}

/** Session state of the workflow signals derived from the ticket logs (SPEC-0016). */
export const useSignalsStore = create<SignalsState>((set, get) => ({
  initialized: false,
  known: new Set(),
  fresh: new Set(),
  unseen: [],
  toasts: [],

  ingest: (tickets) => {
    const { initialized, known } = get();
    const all = tickets.filter((t) => !t.archived).flatMap(signalsOf);
    const arrived = all.filter((s) => !known.has(s.key));
    if (initialized && !arrived.length) return;
    const nextKnown = new Set(known);
    arrived.forEach((s) => nextKnown.add(s.key));
    if (!initialized) {
      set({ initialized: true, known: nextKnown });
      return;
    }
    // One refresh can bring entries of several tickets; order them by time, not by ticket.
    const loud = arrived.filter(interrupts).sort(newestFirst);
    set((st) => ({
      known: nextKnown,
      fresh: new Set([...st.fresh, ...arrived.map((s) => s.key)]),
      unseen: [...loud, ...st.unseen],
      toasts: [...st.toasts, ...[...loud].reverse()].slice(-MAX_TOASTS),
    }));
  },

  markSeen: () => set({ unseen: [] }),

  dismissToast: (key) => set((st) => ({ toasts: st.toasts.filter((t) => t.key !== key) })),
}));
