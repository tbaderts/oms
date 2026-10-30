import { create } from 'zustand';
import type { LinkIndex, ScanResult, StoryStatus, StoryboardDetail, StoryboardSummary } from '@shared/types/storyboards';

export type OverviewMode = 'strip' | 'lanes' | 'sequence';
export type Editing = null | { kind: 'step'; stepId: string } | { kind: 'story' } | { kind: 'new' };

export interface CatalogueFilter {
  text: string;
  domain: string;
  status: StoryStatus | '';
  tag: string;
}

interface StoryboardsState {
  scan: ScanResult | null;
  loading: boolean;
  error: string | null;
  filter: CatalogueFilter;
  selectedId: string | null;
  detail: StoryboardDetail | null;
  detailError: string | null;
  /** null = the overview without a selected step. Strip and Lanes share it, and the hover. */
  selectedStepId: string | null;
  hoveredStepId: string | null;
  mode: OverviewMode;
  layers: { data: boolean; extensions: boolean };
  editing: Editing;
  presenting: boolean;
  links: LinkIndex | null;
  aiAvailable: boolean;

  /** Full rescan (a change can add or remove whole storyboards), then reload the open storyboard. */
  refresh: () => Promise<void>;
  open: (id: string | null) => Promise<void>;
  reloadDetail: () => Promise<void>;
  selectStep: (stepId: string | null) => void;
  hoverStep: (stepId: string | null) => void;
  moveSelection: (to: 'next' | 'prev' | 'first' | 'last') => void;
  setMode: (mode: OverviewMode) => void;
  toggleLayer: (layer: 'data' | 'extensions') => void;
  setFilter: (f: Partial<CatalogueFilter>) => void;
  setEditing: (editing: Editing) => void;
  setPresenting: (presenting: boolean) => void;
  loadLinks: () => Promise<void>;
}

const api = () => window.cockpit.storyboards;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
let detailSeq = 0;

/** Case-insensitive substring over title, summary and step titles, plus exact domain/status/tag filters. */
export function filterCatalogue(catalogue: StoryboardSummary[], f: CatalogueFilter): StoryboardSummary[] {
  const text = f.text.trim().toLowerCase();
  return catalogue.filter(
    (s) =>
      (!text || [s.title, s.description, ...s.stepTitles].some((t) => t.toLowerCase().includes(text))) &&
      (!f.domain || s.domain === f.domain) &&
      (!f.status || s.status === f.status) &&
      (!f.tag || s.tags.includes(f.tag)),
  );
}

export const useStoryboardsStore = create<StoryboardsState>((set, get) => ({
  scan: null,
  loading: false,
  error: null,
  filter: { text: '', domain: '', status: '', tag: '' },
  selectedId: null,
  detail: null,
  detailError: null,
  selectedStepId: null,
  hoveredStepId: null,
  mode: 'strip',
  layers: { data: false, extensions: false },
  editing: null,
  presenting: false,
  links: null,
  aiAvailable: false,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const [scan, aiAvailable] = await Promise.all([api().scan(), api().aiAvailable().catch(() => false)]);
      set({ scan, aiAvailable, loading: false });
      const { selectedId } = get();
      if (selectedId && !scan.catalogue.some((s) => s.id === selectedId)) set({ selectedId: null, detail: null, selectedStepId: null, editing: null, presenting: false });
      else if (selectedId) await get().reloadDetail();
    } catch (e) {
      set({ loading: false, error: message(e) });
    }
  },

  open: async (id) => {
    if (id === get().selectedId && get().detail) return;
    set({ selectedId: id, detail: null, detailError: null, selectedStepId: null, hoveredStepId: null, editing: null, presenting: false });
    if (id) await get().reloadDetail();
  },

  reloadDetail: async () => {
    const id = get().selectedId;
    if (!id) return;
    const seq = ++detailSeq;
    try {
      const r = await api().detail(id);
      if (seq !== detailSeq) return;
      if (!r.ok) {
        set({ detail: null, detailError: r.message });
        return;
      }
      const { selectedStepId } = get();
      set({
        detail: r.detail,
        detailError: null,
        selectedStepId: selectedStepId && r.detail.steps.some((s) => s.id === selectedStepId) ? selectedStepId : null,
      });
    } catch (e) {
      if (seq === detailSeq) set({ detailError: message(e) });
    }
  },

  selectStep: (stepId) => set({ selectedStepId: stepId }),
  hoverStep: (stepId) => set({ hoveredStepId: stepId }),
  moveSelection: (to) => {
    const steps = get().detail?.steps ?? [];
    if (!steps.length) return;
    const at = steps.findIndex((s) => s.id === get().selectedStepId);
    const index =
      to === 'first' ? 0
        : to === 'last' ? steps.length - 1
          : to === 'next' ? (at < 0 ? 0 : Math.min(at + 1, steps.length - 1))
            : at < 0 ? 0 : Math.max(at - 1, 0);
    set({ selectedStepId: steps[index].id });
  },
  setMode: (mode) => set({ mode }),
  toggleLayer: (layer) => set((s) => ({ layers: { ...s.layers, [layer]: !s.layers[layer] } })),
  setFilter: (f) => set((s) => ({ filter: { ...s.filter, ...f } })),
  setEditing: (editing) => set({ editing, presenting: false }),
  setPresenting: (presenting) => set({ presenting, editing: null }),
  loadLinks: async () => {
    if (get().links) return;
    try {
      set({ links: await api().links() });
    } catch {
      set({ links: { api: [], events: [], states: [], requirements: [] } });
    }
  },
}));
