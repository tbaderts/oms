import { create } from 'zustand';
import {
  FILTER_FIELDS,
  SEARCH_PATH,
  toSearchParams,
  type ApiResponse,
  type CommandCatalog,
  type HistoryEntry,
  type OrderFollowUp,
  type Paging,
  type QueryParam,
  type SaveTemplateResult,
  type TemplateSource,
} from '@shared/apiExplorer';
import { getCockpitApi } from '@/api/cockpit-api';
import { buildTemplate, orderIdOf, type CheckResult } from '@/lib/api-schema';
import { checkTemplateBody, inlineFileVariables, liveContext, orderToTemplate, resolveVariables, templatize, type CommandTemplate } from '@/lib/api-templates';

export type ApiExplorerTab = 'commands' | 'orders' | 'history';

interface ApiExplorerState {
  tab: ApiExplorerTab;
  catalog: CommandCatalog | null;
  baseUrl: string;
  local: boolean;

  selectedType: string | null;
  bodyText: string;
  /** The body as last generated, to tell whether the user edited it. */
  templateText: string;
  check: CheckResult;
  sending: boolean;
  lastCommand: { type: string; response: ApiResponse } | null;

  followUpId: string | null;
  followUp: OrderFollowUp | null;
  followUpLoading: boolean;

  filters: QueryParam[];
  page: number;
  size: number;
  sort: string;
  searching: boolean;
  searchResult: ApiResponse | null;

  history: HistoryEntry[];

  /** The `.http` template files (SPEC-0008). */
  templates: TemplateSource[];
  /** The `@name = value` variables of the template the body came from. */
  templateVars: Record<string, string>;
  /** The file of the template the body came from; Save as template offers it first. */
  templateSource: string | null;

  /** Shown above the editor after restoring a body that was stored truncated. */
  restoredNotice: string | null;

  load: () => Promise<void>;
  loadCatalog: () => Promise<void>;
  loadTemplates: () => Promise<void>;
  /** Puts a template's body in the editor; asks first if the body was edited. */
  selectTemplate: (template: CommandTemplate) => boolean;
  /** An OrderCreateCmd body from an existing order's client fields; asks first if the body was edited. */
  useOrderAsTemplate: (order: Record<string, unknown>) => boolean;
  /**
   * Appends the editor body to a template file; `useVariables` turns clOrdId, commandId and times into
   * variables. File variables the target does not declare are written as their values.
   */
  saveTemplate: (target: { path: string } | { newFile: string }, name: string, useVariables: boolean) => Promise<SaveTemplateResult>;
  setTab: (tab: ApiExplorerTab) => void;
  /** Replaces the body with the type's template (plus `preset`); asks first if the body was edited. */
  selectType: (type: string, preset?: Record<string, unknown>) => boolean;
  setBody: (text: string) => void;
  send: () => Promise<void>;
  openFollowUp: (orderId: string) => Promise<void>;
  refreshFollowUp: () => Promise<void>;

  addFilter: () => void;
  /** Changing the field resets operator and value; switching to or from `between` resets the value. */
  updateFilter: (index: number, patch: Partial<QueryParam>) => void;
  removeFilter: (index: number) => void;
  setPaging: (patch: Partial<Pick<ApiExplorerState, 'size' | 'sort'>>) => void;
  /** The request URL the current filters produce; main builds the same one. */
  searchUrl: () => string;
  search: (page?: number) => Promise<void>;

  loadHistory: () => Promise<void>;
  /** Puts a past request back into the editor or the filter builder. */
  restore: (entry: HistoryEntry) => void;
  clearHistory: () => Promise<void>;
}

const paging = (s: Pick<ApiExplorerState, 'page' | 'size' | 'sort'>): Paging => ({
  page: s.page,
  size: s.size,
  ...(s.sort.trim() ? { sort: s.sort.trim() } : {}),
});

const NO_FINDINGS: CheckResult = { findings: [] };

/** The body check with template variables resolved against the template file and the followed order. */
function checkOf(s: Pick<ApiExplorerState, 'catalog' | 'selectedType' | 'bodyText' | 'templateVars' | 'followUpId'>): CheckResult {
  const schema = s.selectedType ? s.catalog?.schemas[s.selectedType] : undefined;
  if (!schema || !s.selectedType) return NO_FINDINGS;
  return checkTemplateBody(s.bodyText, s.selectedType, schema, liveContext(s.templateVars, s.followUpId));
}

export const useApiExplorerStore = create<ApiExplorerState>((set, get) => ({
  tab: 'commands',
  catalog: null,
  baseUrl: '',
  local: true,

  selectedType: null,
  bodyText: '',
  templateText: '',
  check: NO_FINDINGS,
  sending: false,
  lastCommand: null,

  followUpId: null,
  followUp: null,
  followUpLoading: false,

  filters: [],
  page: 0,
  size: 50,
  sort: '',
  searching: false,
  searchResult: null,

  history: [],
  templates: [],
  templateVars: {},
  templateSource: null,
  restoredNotice: null,

  load: async () => {
    const api = getCockpitApi().apiExplorer;
    const [{ baseUrl, local }] = await Promise.all([api.baseUrl(), get().loadCatalog(), get().loadHistory(), get().loadTemplates()]);
    set({ baseUrl, local });
  },

  loadCatalog: async () => {
    const catalog = await getCockpitApi().apiExplorer.catalog();
    set({ catalog });
    if (get().selectedType) set({ check: checkOf(get()) });
  },

  loadTemplates: async () => {
    set({ templates: await getCockpitApi().apiExplorer.templates() });
  },

  selectTemplate: (template) => {
    const { bodyText, templateText } = get();
    if (bodyText !== templateText && !window.confirm('Replace the edited command body with this template?')) return false;
    set({ selectedType: template.type, bodyText: template.body, templateText: template.body, templateVars: template.variables, templateSource: template.source, tab: 'commands', restoredNotice: null });
    set({ check: checkOf(get()) });
    return true;
  },

  useOrderAsTemplate: (order) => {
    const { catalog, bodyText, templateText } = get();
    const schema = catalog?.schemas.OrderCreateCmd;
    if (!schema) return false;
    if (bodyText !== templateText && !window.confirm('Replace the edited command body with this order?')) return false;
    const text = orderToTemplate(order, schema);
    set({ selectedType: 'OrderCreateCmd', bodyText: text, templateText: text, templateVars: {}, templateSource: null, tab: 'commands', restoredNotice: null });
    set({ check: checkOf(get()) });
    return true;
  },

  saveTemplate: async (target, name, useVariables) => {
    const { bodyText, templateVars, templates } = get();
    const declared = 'path' in target ? templates.find((s) => s.path === target.path)?.file?.variables ?? {} : { baseUrl: '' };
    const text = inlineFileVariables(bodyText, templateVars, declared);
    const body = useVariables ? templatize(text) : text;
    const result = await getCockpitApi().apiExplorer.saveTemplate({ ...target, name, body });
    if (result.ok) await get().loadTemplates();
    return result;
  },

  setTab: (tab) => set({ tab }),

  selectType: (type, preset) => {
    const { catalog, bodyText, templateText } = get();
    const schema = catalog?.schemas[type];
    if (!schema) return false;
    if (bodyText !== templateText && !window.confirm('Replace the edited command body with a new template?')) return false;
    const text = JSON.stringify(buildTemplate(type, schema, preset), null, 2);
    set({ selectedType: type, bodyText: text, templateText: text, templateVars: {}, templateSource: null, tab: 'commands', restoredNotice: null });
    set({ check: checkOf(get()) });
    return true;
  },

  setBody: (text) => {
    set({ bodyText: text });
    set({ check: checkOf(get()) });
  },

  send: async () => {
    const { bodyText, check, local, baseUrl, selectedType, sending, templateVars, followUpId } = get();
    if (sending || check.parseError) return;
    if (resolveVariables(bodyText, liveContext(templateVars, followUpId)).unresolved.length) {
      set({ check: checkOf(get()) });
      return;
    }
    let confirmedHost: string | undefined;
    if (!local) {
      const host = new URL(baseUrl).hostname;
      if (!window.confirm(`Send this command to ${host}? It is not a local oms-core.`)) return;
      confirmedHost = host;
    }
    // Variables get fresh values on every send, after any confirmation; the editor keeps the template.
    const resolved = resolveVariables(bodyText, liveContext(templateVars, followUpId));
    set({ sending: true });
    try {
      const response = await getCockpitApi().apiExplorer.sendCommand(resolved.text, confirmedHost);
      set({ lastCommand: { type: selectedType ?? '', response } });
      const orderId = response.status !== null ? orderIdOf(JSON.parse(resolved.text), response.body) : null;
      if (orderId) void get().openFollowUp(orderId);
      void get().loadHistory();
    } finally {
      set({ sending: false });
    }
  },

  openFollowUp: async (orderId) => {
    set({ followUpId: orderId, followUpLoading: true });
    // {{orderId}} in the body now means this order.
    if (get().selectedType) set({ check: checkOf(get()) });
    try {
      const followUp = await getCockpitApi().apiExplorer.followUp(orderId);
      // A newer follow-up may have been opened meanwhile.
      if (get().followUpId === orderId) set({ followUp });
    } finally {
      if (get().followUpId === orderId) set({ followUpLoading: false });
    }
  },

  refreshFollowUp: async () => {
    const id = get().followUpId;
    if (id) await get().openFollowUp(id);
  },

  // Any change to the query starts again at the first page, which is what Search sends.
  addFilter: () => set((s) => ({ page: 0, filters: [...s.filters, { field: FILTER_FIELDS[0].field, op: 'eq', value: '' }] })),

  updateFilter: (index, patch) =>
    set((s) => ({
      page: 0,
      filters: s.filters.map((f, i) => {
        if (i !== index) return f;
        if (patch.field && patch.field !== f.field) {
          const field = FILTER_FIELDS.find((x) => x.field === patch.field) ?? FILTER_FIELDS[0];
          return { field: field.field, op: field.ops[0], value: '' };
        }
        const next = { ...f, ...patch };
        if (patch.op && (patch.op === 'between') !== (f.op === 'between')) next.value = '';
        return next;
      }),
    })),

  removeFilter: (index) => set((s) => ({ page: 0, filters: s.filters.filter((_, i) => i !== index) })),

  setPaging: (patch) => set({ ...patch, page: 0 }),

  searchUrl: () => {
    const s = get();
    const qs = toSearchParams(s.filters, paging(s)).toString();
    return `${s.baseUrl.replace(/\/+$/, '')}${SEARCH_PATH}${qs ? `?${qs}` : ''}`;
  },

  search: async (page) => {
    if (page !== undefined) set({ page });
    set({ searching: true });
    try {
      const s = get();
      set({ searchResult: await getCockpitApi().apiExplorer.search(s.filters, paging(s)) });
      await get().loadHistory();
    } finally {
      set({ searching: false });
    }
  },

  loadHistory: async () => {
    set({ history: await getCockpitApi().apiExplorer.history() });
  },

  restore: (entry) => {
    const { catalog, bodyText, templateText, selectedType } = get();
    const r = entry.request;
    if ('body' in r) {
      if (bodyText !== templateText && !window.confirm('Replace the edited command body with the one from history?')) return;
      let type: unknown;
      try {
        type = JSON.parse(r.body)?.type;
      } catch {
        // an invalid body is restored as it was sent
      }
      const known = typeof type === 'string' && catalog?.schemas[type] ? type : selectedType ?? catalog?.commandTypes[0] ?? null;
      set({
        tab: 'commands',
        selectedType: known,
        bodyText: r.body,
        templateText: r.body,
        templateVars: {},
        templateSource: null,
        restoredNotice: r.truncated ? 'This body was truncated when it was stored; check it before sending.' : null,
      });
      set({ check: checkOf(get()) });
    } else {
      set({
        tab: 'orders',
        filters: r.params.map((p) => ({ ...p })),
        page: r.page ?? 0,
        size: r.size ?? 50,
        sort: r.sort ?? '',
      });
    }
  },

  clearHistory: async () => {
    if (!window.confirm('Clear the API Explorer history?')) return;
    await getCockpitApi().apiExplorer.clearHistory();
    await get().loadHistory();
  },
}));
