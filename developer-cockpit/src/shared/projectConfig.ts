import { z } from 'zod';
import { parseDocument } from 'yaml';

/**
 * The project's own configuration, `cockpit.yaml` at the workspace root (SPEC-0076). It says what
 * the project is, where its knowledge base, contracts and CLIs live, which code-generation tasks
 * and API specs it has, and what the Monitoring view watches. The cockpit itself knows nothing
 * about any particular project: everything project-specific comes from this file.
 */

export const PROJECT_CONFIG_FILE = 'cockpit.yaml';

const httpUrl = z
  .string()
  .trim()
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Must be an http(s) URL');

const relPath = z.string().trim().min(1, 'Must not be empty');

const link = z.object({ label: z.string().trim().min(1), url: httpUrl });

const healthCheck = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('http'), url: httpUrl, timeoutMs: z.number().int().min(100).max(30_000).default(3000) }),
  z.object({ kind: z.literal('spring-actuator'), url: httpUrl, timeoutMs: z.number().int().min(100).max(30_000).default(3000) }),
  z.object({
    kind: z.literal('tcp'),
    host: z.string().trim().min(1),
    port: z.number().int().min(1).max(65_535),
    timeoutMs: z.number().int().min(100).max(30_000).default(3000),
  }),
]);

const service = z.object({
  name: z.string().trim().min(1),
  group: z.string().trim().min(1).default('Services'),
  check: healthCheck,
  metricsUrl: httpUrl.optional(),
  links: z.array(link).default([]),
});

const panelSource = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('promql'), query: z.string().trim().min(1) }),
  z.object({
    kind: z.literal('scrape'),
    service: z.string().trim().min(1),
    metric: z.string().trim().min(1),
    labels: z.record(z.string(), z.string()).optional(),
    by: z.string().trim().min(1).optional(),
    quantile: z.number().gt(0).lt(1).optional(),
    rate: z.boolean().optional(),
  }),
]);

export const PANEL_UNITS = ['count', 'ms', 's', 'percent', 'bytes', 'perMinute'] as const;

const panel = z.object({
  title: z.string().trim().min(1),
  type: z.enum(['stat', 'timeseries', 'bars']),
  unit: z.enum(PANEL_UNITS).default('count'),
  source: panelSource,
  /** For bars from a PromQL source: the label naming each bar. */
  by: z.string().trim().min(1).optional(),
});

const monitoring = z
  .object({
    intervalSeconds: z.number().int().min(5).max(300).default(10),
    prometheusUrl: httpUrl.optional(),
    services: z.array(service).default([]),
    panels: z.array(panel).default([]),
  })
  .superRefine((m, ctx) => {
    const names = new Set<string>();
    m.services.forEach((s, i) => {
      if (names.has(s.name)) ctx.addIssue({ code: 'custom', path: ['services', i, 'name'], message: `Duplicate service name "${s.name}"` });
      names.add(s.name);
    });
    m.panels.forEach((p, i) => {
      if (p.source.kind === 'scrape') {
        const target = m.services.find((s) => s.name === (p.source as { service: string }).service);
        if (!target) ctx.addIssue({ code: 'custom', path: ['panels', i, 'source', 'service'], message: `Unknown service "${p.source.service}"` });
        else if (!target.metricsUrl)
          ctx.addIssue({ code: 'custom', path: ['panels', i, 'source', 'service'], message: `Service "${target.name}" has no metricsUrl` });
      } else if (!m.prometheusUrl) {
        ctx.addIssue({ code: 'custom', path: ['panels', i, 'source'], message: 'A promql panel needs monitoring.prometheusUrl' });
      }
    });
  });

const codegenTask = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().default(''),
  cwd: z.string().trim().default('.'),
  command: z.array(z.string().min(1)).min(1),
  windowsCommand: z.array(z.string().min(1)).min(1).optional(),
  inputs: z.string().optional(),
});

const api = z.object({ name: z.string().trim().min(1), spec: relPath, baseUrl: httpUrl });

export const projectConfigSchema = z.object({
  project: z.object({ name: z.string().trim().min(1).default('Project'), description: z.string().default('') }).default({ name: 'Project', description: '' }),
  knowledgeBase: z
    .object({
      root: relPath.default('knowledge-base'),
      checkScript: relPath.default('tools/okf-check/okf-check.mjs'),
      stateDiagramDoc: relPath.optional(),
      /** MCP endpoint (streamable HTTP) of a knowledge server for the KB chat; see the README. */
      serverUrl: httpUrl.optional(),
    })
    .default({ root: 'knowledge-base', checkScript: 'tools/okf-check/okf-check.mjs' }),
  specs: z
    .object({
      cli: relPath.default('specs/tools/spec.mjs'),
      openApiPaths: z.array(relPath).default([]),
      avroPaths: z.array(relPath).default([]),
    })
    .default({ cli: 'specs/tools/spec.mjs', openApiPaths: [], avroPaths: [] }),
  codegen: z.array(codegenTask).default([]),
  watch: z.array(relPath).default([]),
  links: z.array(link).default([]),
  storyboards: z.object({ roots: z.array(relPath).optional(), library: relPath.default('storyboard.excalidrawlib') }).default({ library: 'storyboard.excalidrawlib' }),
  apiExplorer: z.object({ templateSources: z.array(relPath).default([]), apis: z.array(api).default([]) }).default({ templateSources: [], apis: [] }),
  monitoring: monitoring.default({ intervalSeconds: 10, services: [], panels: [] }),
});

export type ProjectConfig = z.infer<typeof projectConfigSchema>;
export type MonitoringConfig = ProjectConfig['monitoring'];
export type MonitoredService = MonitoringConfig['services'][number];
export type HealthCheck = MonitoredService['check'];
export type PanelConfig = MonitoringConfig['panels'][number];
export type PanelSource = PanelConfig['source'];
export type PanelUnit = (typeof PANEL_UNITS)[number];
export type ProjectLink = z.infer<typeof link>;
export type CodegenTaskConfig = z.infer<typeof codegenTask>;
export type ApiConfig = z.infer<typeof api>;

export interface ConfigProblem {
  /** Dotted path of the offending entry, e.g. `monitoring.services[2].check.url`; empty for the file itself. */
  path: string;
  message: string;
}

export interface ProjectConfigResult {
  /** Absolute path of the project's `cockpit.yaml`. */
  file: string;
  /** False when the file does not exist; the defaults apply and that is not an error. */
  present: boolean;
  /** The validated config; the defaults when the file is absent or invalid. */
  config: ProjectConfig;
  errors: ConfigProblem[];
  /**
   * The settings the file states itself (not filled from defaults). Only these replace the user's
   * own values in `config.json`, so a file that only lists services leaves the user's paths alone.
   */
  declared: DeclaredSettings;
}

export interface DeclaredSettings {
  knowledgeBaseRoot: boolean;
  openApiPaths: boolean;
  avroPaths: boolean;
  storyboardRoots: boolean;
  templateSources: boolean;
}

const NOTHING_DECLARED: DeclaredSettings = { knowledgeBaseRoot: false, openApiPaths: false, avroPaths: false, storyboardRoots: false, templateSources: false };

function declaredIn(raw: Record<string, any>): DeclaredSettings {
  const has = (o: unknown, k: string) => !!o && typeof o === 'object' && (o as Record<string, unknown>)[k] !== undefined;
  return {
    knowledgeBaseRoot: has(raw.knowledgeBase, 'root'),
    openApiPaths: has(raw.specs, 'openApiPaths'),
    avroPaths: has(raw.specs, 'avroPaths'),
    storyboardRoots: has(raw.storyboards, 'roots') || has(raw.knowledgeBase, 'root'),
    templateSources: has(raw.apiExplorer, 'templateSources'),
  };
}

/** The result for a workspace without a `cockpit.yaml`. */
export function absentProjectConfig(file: string): ProjectConfigResult {
  return { file, present: false, config: defaultProjectConfig(), errors: [], declared: NOTHING_DECLARED };
}

/** The configuration of a project without a `cockpit.yaml`. */
export function defaultProjectConfig(): ProjectConfig {
  return projectConfigSchema.parse({});
}

/** `['monitoring', 'services', 2, 'check']` → `monitoring.services[2].check`. */
export function formatPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((acc, part) => (typeof part === 'number' ? `${acc}[${part}]` : acc ? `${acc}.${String(part)}` : String(part)), '');
}

/** The storyboard roots: as configured, else `<knowledge base>/storyboards`. */
export function storyboardRoots(config: ProjectConfig): string[] {
  return config.storyboards.roots?.length ? [...config.storyboards.roots] : [`${config.knowledgeBase.root.replace(/\/+$/, '')}/storyboards`];
}

/**
 * Parses and validates the text of a `cockpit.yaml`. Never throws: a YAML syntax error or a schema
 * violation comes back as `errors` (with the line, or the entry's dotted path) and the defaults.
 */
export function parseProjectConfig(text: string, file: string): ProjectConfigResult {
  const doc = parseDocument(text, { prettyErrors: true });
  if (doc.errors.length) {
    return {
      file,
      present: true,
      config: defaultProjectConfig(),
      declared: NOTHING_DECLARED,
      errors: doc.errors.map((e) => ({ path: '', message: `YAML syntax error${e.linePos ? ` at line ${e.linePos[0].line}` : ''}: ${e.message.split('\n')[0]}` })),
    };
  }
  const raw = doc.toJS() ?? {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { file, present: true, config: defaultProjectConfig(), declared: NOTHING_DECLARED, errors: [{ path: '', message: 'The file must contain a mapping (key: value pairs)' }] };
  }
  const parsed = projectConfigSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      file,
      present: true,
      config: defaultProjectConfig(),
      declared: NOTHING_DECLARED,
      errors: parsed.error.issues.map((i) => ({ path: formatPath(i.path), message: i.message })),
    };
  }
  return { file, present: true, config: parsed.data, errors: [], declared: declaredIn(raw) };
}
