import { create } from 'zustand';
import {
  SAFE_METHODS,
  buildUrl,
  isLocalHost,
  type ApiCatalog,
  type ApiInfo,
  type ApiOperation,
  type ApiResponse,
  type HistoryEntry,
  type JsonSchema,
  type SaveTemplateResult,
  type TemplateSource,
} from '@shared/apiExplorer';
import { templateName, type HttpRequestBlock } from '@shared/httpFile';
import { getCockpitApi } from '@/api/cockpit-api';
import { buildBody, checkBody, type CheckResult } from '@/lib/api-schema';
import { inlineFileVariables, liveContext, resolveVariables } from '@/lib/api-templates';

export type ApiExplorerTab = 'operations' | 'templates' | 'history';

/** The operation the editor was filled from. */
export interface Selection {
  api: string;
  operation: string;
}

interface ApiExplorerState {
  tab: ApiExplorerTab;
  catalog: ApiCatalog | null;
  catalogError: string | null;

  selection: Selection | null;
  /** The chosen variant of a polymorphic body. */
  variant: string | null;
  pathParams: Record<string, string>;
  queryParams: Record<string, string>;

  method: string;
  url: string;
  /** `Name: value` per line. */
  headersText: string;
  bodyText: string;
  /** The editor content as last generated or loaded, to tell whether the user edited it. */
  baseline: string;
  /** For the history: the operation or template the request came from. */
  label: string;
  check: CheckResult;

  /** The `@name = value` variables of the template the request came from. */
  templateVars: Record<string, string>;
  /** The file of the template the request came from; Save as template offers it first. */
  templateSource: string | null;

  sending: boolean;
  response: ApiResponse | null;
  history: HistoryEntry[];
  templates: TemplateSource[];
  /** Shown above the editor, e.g. after restoring a body that was stored truncated. */
  notice: string | null;

  load: () => Promise<void>;
  loadCatalog: () => Promise<void>;
  loadTemplates: () => Promise<void>;
  loadHistory: () => Promise<void>;
  setTab: (tab: ApiExplorerTab) => void;
  /** Fills the editor from an operation; asks first if the request was edited. */
  selectOperation: (api: string, operation: string) => boolean;
  selectVariant: (name: string) => void;
  setParam: (where: 'path' | 'query', name: string, value: string) => void;
  setMethod: (method: string) => void;
  setUrl: (url: string) => void;
  setHeaders: (text: string) => void;
  setBody: (text: string) => void;
  /** Fills the editor from a `.http` request; asks first if the request was edited. */
  selectTemplate: (source: string, request: HttpRequestBlock, variables: Record<string, string>) => boolean;
  /** Fills the editor from a history entry; asks first if the request was edited. */
  restore: (entry: HistoryEntry) => boolean;
  send: () => Promise<void>;
  saveTemplate: (target: { path: string } | { newFile: string }, name: string) => Promise<SaveTemplateResult>;
  clearHistory: () => Promise<void>;
}

const NO_CHECK: CheckResult = { findings: [] };

const snapshot = (s: Pick<ApiExplorerState, 'method' | 'url' | 'headersText' | 'bodyText'>) => JSON.stringify([s.method, s.url, s.headersText, s.bodyText]);

export function findOperation(catalog: ApiCatalog | null, sel: Selection | null): { api: ApiInfo; op: ApiOperation } | null {
  const api = catalog?.apis.find((a) => a.name === sel?.api);
  const op = api?.operations.find((o) => o.id === sel?.operation);
  return api && op ? { api, op } : null;
}

/** The schema and discriminator the body is checked against. */
function bodySchema(catalog: ApiCatalog | null, sel: Selection | null, variant: string | null) {
  const found = findOperation(catalog, sel);
  if (!found) return null;
  const v = found.op.variants.find((x) => x.name === variant);
  if (v) return { schema: v.schema, discriminator: v.discriminator };
  return found.op.requestSchema ? { schema: found.op.requestSchema as JsonSchema, discriminator: undefined } : null;
}

function parseHeaders(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

export const useApiExplorerStore = create<ApiExplorerState>((set, get) => {
  /** The body check on the resolved text; unresolved variables block sending. */
  const recheck = () => {
    const s = get();
    const target = bodySchema(s.catalog, s.selection, s.variant);
    if (!s.bodyText.trim() || SAFE_METHODS.includes(s.method)) return set({ check: NO_CHECK });
    const r = resolveVariables(s.bodyText, liveContext(s.templateVars));
    if (r.unresolved.length) {
      return set({ check: { findings: r.unresolved.map((n) => ({ path: `{{${n}}}`, message: 'unresolved variable' })), unresolved: r.unresolved } });
    }
    set({ check: target ? checkBody(r.text, target.schema, target.discriminator) : NO_CHECK });
  };

  const edited = () => snapshot(get()) !== get().baseline;
  const confirmReplace = (what: string) => !edited() || window.confirm(`Replace the edited request with ${what}?`);

  const fill = (patch: Partial<ApiExplorerState>) => {
    set({ ...patch, response: null });
    set({ baseline: snapshot(get()) });
    recheck();
  };

  const rebuildUrl = () => {
    const found = findOperation(get().catalog, get().selection);
    if (found) set({ url: buildUrl(found.api.baseUrl, found.op.path, get().pathParams, get().queryParams) });
  };

  const bodyFor = (op: ApiOperation, variant: string | null): string => {
    const v = op.variants.find((x) => x.name === variant);
    const schema = v?.schema ?? op.requestSchema;
    return schema ? JSON.stringify(buildBody(schema, v?.discriminator), null, 2) : '';
  };

  return {
    tab: 'operations',
    catalog: null,
    catalogError: null,
    selection: null,
    variant: null,
    pathParams: {},
    queryParams: {},
    method: 'GET',
    url: '',
    headersText: '',
    bodyText: '',
    baseline: snapshot({ method: 'GET', url: '', headersText: '', bodyText: '' }),
    label: '',
    check: NO_CHECK,
    templateVars: {},
    templateSource: null,
    sending: false,
    response: null,
    history: [],
    templates: [],
    notice: null,

    load: async () => {
      await Promise.all([get().loadCatalog(), get().loadHistory(), get().loadTemplates()]);
    },

    loadCatalog: async () => {
      try {
        const catalog = await getCockpitApi().apiExplorer.catalog();
        set({ catalog, catalogError: null });
        recheck();
      } catch (err) {
        set({ catalogError: (err as Error).message });
      }
    },

    loadTemplates: async () => {
      try {
        set({ templates: await getCockpitApi().apiExplorer.templates() });
      } catch {
        set({ templates: [] });
      }
    },

    loadHistory: async () => {
      try {
        set({ history: await getCockpitApi().apiExplorer.history() });
      } catch {
        set({ history: [] });
      }
    },

    setTab: (tab) => set({ tab }),

    selectOperation: (apiName, operation) => {
      const found = findOperation(get().catalog, { api: apiName, operation });
      if (!found || !confirmReplace('this operation')) return false;
      const { api, op } = found;
      const variant = op.variants[0]?.name ?? null;
      const defaults = (where: 'path' | 'query') =>
        Object.fromEntries(op.params.filter((p) => p.in === where).map((p) => [p.name, p.schema?.default !== undefined ? String(p.schema.default) : '']));
      const pathParams = defaults('path');
      const queryParams = defaults('query');
      fill({
        selection: { api: apiName, operation },
        variant,
        pathParams,
        queryParams,
        method: op.method,
        url: buildUrl(api.baseUrl, op.path, pathParams, queryParams),
        headersText: '',
        bodyText: bodyFor(op, variant),
        label: `${apiName} · ${op.id}`,
        templateVars: {},
        templateSource: null,
        notice: null,
      });
      return true;
    },

    selectVariant: (name) => {
      const found = findOperation(get().catalog, get().selection);
      if (!found || !found.op.variants.some((v) => v.name === name)) return;
      const replaceBody = !edited() || window.confirm('Replace the edited body with this variant?');
      set({ variant: name, label: `${found.api.name} · ${found.op.id} · ${name}` });
      if (replaceBody) fill({ bodyText: bodyFor(found.op, name) });
      else recheck();
    },

    setParam: (where, name, value) => {
      if (where === 'path') set({ pathParams: { ...get().pathParams, [name]: value } });
      else set({ queryParams: { ...get().queryParams, [name]: value } });
      rebuildUrl();
    },

    setMethod: (method) => {
      set({ method: method.toUpperCase() });
      recheck();
    },
    setUrl: (url) => set({ url }),
    setHeaders: (headersText) => set({ headersText }),
    setBody: (bodyText) => {
      set({ bodyText });
      recheck();
    },

    selectTemplate: (source, request, variables) => {
      if (!confirmReplace('this template')) return false;
      fill({
        selection: null,
        variant: null,
        pathParams: {},
        queryParams: {},
        method: request.method,
        url: request.url,
        headersText: '',
        bodyText: request.body ?? '',
        label: templateName(request),
        templateVars: variables,
        templateSource: source,
        notice: null,
      });
      return true;
    },

    restore: (entry) => {
      if (!confirmReplace('this request')) return false;
      const headersText = Object.entries(entry.request.headers ?? {})
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');
      fill({
        selection: null,
        variant: null,
        pathParams: {},
        queryParams: {},
        method: entry.method,
        url: entry.url ?? entry.path,
        headersText,
        bodyText: entry.request.body ?? '',
        label: entry.label,
        templateVars: {},
        templateSource: null,
        notice: entry.request.truncated ? 'This body was stored truncated; check it before sending.' : null,
      });
      return true;
    },

    send: async () => {
      const s = get();
      if (s.sending || s.check.parseError || s.check.unresolved?.length) return;
      const ctx = liveContext(s.templateVars);
      const resolved = [s.url, s.headersText, s.bodyText].map((t) => resolveVariables(t, ctx));
      const unresolved = [...new Set(resolved.flatMap((r) => r.unresolved))];
      if (unresolved.length) {
        set({ response: { ok: false, status: null, durationMs: 0, body: null, contentType: '', url: s.url, error: `Unresolved variables: ${unresolved.join(', ')}`, refused: true } });
        return;
      }
      const [url, headersText, body] = resolved.map((r) => r.text);
      let confirmedHost: string | undefined;
      if (!SAFE_METHODS.includes(s.method) && !isLocalHost(url)) {
        let host = '';
        try {
          host = new URL(url).hostname;
        } catch {
          // the main process refuses an invalid URL
        }
        if (host) {
          if (!window.confirm(`Send this ${s.method} request to ${host}? It is not a local service.`)) return;
          confirmedHost = host;
        }
      }
      set({ sending: true });
      try {
        const response = await getCockpitApi().apiExplorer.send(
          { method: s.method, url, headers: parseHeaders(headersText), ...(body.trim() ? { body } : {}), label: s.label },
          confirmedHost,
        );
        set({ response, sending: false });
      } catch (err) {
        set({ response: { ok: false, status: null, durationMs: 0, body: null, contentType: '', url, error: (err as Error).message }, sending: false });
      }
      void get().loadHistory();
    },

    saveTemplate: async (target, name) => {
      const s = get();
      // Variables the target file does not declare are written as their values.
      const declared = 'path' in target ? (s.templates.find((t) => t.path === target.path)?.file?.variables ?? {}) : {};
      const inline = (text: string) => inlineFileVariables(text, s.templateVars, declared);
      const result = await getCockpitApi().apiExplorer.saveTemplate({ ...target, name, method: s.method, url: inline(s.url), body: inline(s.bodyText) });
      if (result.ok) {
        await get().loadTemplates();
        set({ templateSource: result.path });
      }
      return result;
    },

    clearHistory: async () => {
      await getCockpitApi().apiExplorer.clearHistory();
      set({ history: [] });
    },
  };
});
