import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CockpitConfig, DEFAULT_CONFIG } from '../../shared/types/config';
import type { StoryboardsConfig } from '../../shared/types/storyboards';
import { storyboardRoots, type ProjectConfigResult } from '../../shared/projectConfig';
import { ProjectConfigService } from './ProjectConfigService';

/**
 * Lays the project's own settings from `cockpit.yaml` over the user's config (SPEC-0076). Only the
 * settings the file states replace the user's values: the knowledge-base root, the contract paths,
 * the storyboard roots and the API template sources. Personal settings stay the user's.
 */
export function applyProjectConfig(config: CockpitConfig, project: ProjectConfigResult): CockpitConfig {
  if (!project.present || project.errors.length) return config;
  const { declared, config: p } = project;
  return {
    ...config,
    knowledgeBase: declared.knowledgeBaseRoot ? { ...config.knowledgeBase, rootPath: p.knowledgeBase.root } : config.knowledgeBase,
    specs: {
      ...config.specs,
      ...(declared.openApiPaths ? { openApiPaths: [...p.specs.openApiPaths] } : {}),
      ...(declared.avroPaths ? { avroPaths: [...p.specs.avroPaths] } : {}),
    },
    storyboards: declared.storyboardRoots ? { ...config.storyboards, roots: storyboardRoots(p) } : config.storyboards,
    infrastructure: declared.templateSources
      ? { ...config.infrastructure, apiTemplateSources: [...p.apiExplorer.templateSources] }
      : config.infrastructure,
  };
}

/**
 * Applies the COCKPIT_STORYBOARDS_* environment overrides (they win over the saved config).
 * ROOTS is a ';'-separated list; ENABLED/WRITABLE accept true/false/1/0; malformed values are ignored.
 */
export function resolveStoryboardsConfig(config: StoryboardsConfig, env: NodeJS.ProcessEnv = process.env): StoryboardsConfig {
  const bool = (v: string | undefined, fallback: boolean) =>
    v === undefined ? fallback : /^(true|1)$/i.test(v) ? true : /^(false|0)$/i.test(v) ? false : fallback;
  const int = (v: string | undefined, fallback: number) => (v !== undefined && /^\d+$/.test(v) ? Number(v) : fallback);
  const roots = env.COCKPIT_STORYBOARDS_ROOTS?.split(';').map((r) => r.trim()).filter(Boolean);
  return {
    enabled: bool(env.COCKPIT_STORYBOARDS_ENABLED, config.enabled),
    roots: roots?.length ? roots : [...config.roots],
    maxSourceBytes: int(env.COCKPIT_STORYBOARDS_MAX_SOURCE_BYTES, config.maxSourceBytes),
    maxAssetBytes: int(env.COCKPIT_STORYBOARDS_MAX_ASSET_BYTES, config.maxAssetBytes),
    writable: bool(env.COCKPIT_STORYBOARDS_WRITABLE, config.writable),
  };
}

/** COCKPIT_WORKSPACE_ROOT replaces the configured workspace for this process only (end-to-end runs); it is never saved. */
function withWorkspaceOverride(config: CockpitConfig): CockpitConfig {
  const root = process.env.COCKPIT_WORKSPACE_ROOT;
  return root ? { ...config, general: { ...config.general, workspaceRoot: root } } : config;
}

/**
 * The nearest ancestor of `startDir` that is a git repository (has a `.git` entry of any kind, so
 * worktrees and submodules count), resolved to a real path, or `null` when none is found. Bounded
 * so it cannot walk the whole filesystem.
 */
export function detectWorkspaceRoot(startDir: string): string | null {
  let dir = startDir;
  for (let depth = 0; depth < 64; depth++) {
    try {
      if (fs.lstatSync(path.join(dir, '.git'))) return fs.realpathSync(dir);
    } catch {
      // no .git at this level: keep walking up
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

/**
 * An empty workspace root is filled from the repo the app runs inside, so a fresh checkout on any
 * platform works without manual setup. A non-empty path (the user's explicit choice, even a stale
 * one) is returned unchanged; the resilience guards downstream make a bad path non-fatal.
 */
function resolveWorkspaceRoot(config: CockpitConfig): CockpitConfig {
  if (config.general.workspaceRoot) return config;
  const detected = detectWorkspaceRoot(__dirname) ?? '';
  return detected ? { ...config, general: { ...config.general, workspaceRoot: detected } } : config;
}

export class ConfigService {
  private config: CockpitConfig = { ...DEFAULT_CONFIG };
  private configFile: string;
  private project: ProjectConfigService;

  constructor(private configDir: string = process.env.COCKPIT_CONFIG_DIR || path.join(os.homedir(), '.developer-cockpit')) {
    this.configFile = path.join(configDir, 'config.json');
    this.project = new ProjectConfigService(() => this.userConfig().general.workspaceRoot);
  }

  /**
   * Loads config.json. `migrateKeys` (SPEC-0063) moves plain-text keys into the encrypted store; it
   * runs before any save, so a save never writes a plain-text key back or drops one unmigrated.
   */
  async load(options: { migrateKeys?: (config: CockpitConfig) => { config: CockpitConfig; changed: boolean } } = {}): Promise<CockpitConfig> {
    try {
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
      }
      if (fs.existsSync(this.configFile)) {
        const raw = fs.readFileSync(this.configFile, 'utf-8');
        const loaded = JSON.parse(raw) as Partial<CockpitConfig>;
        const merged = this.merge(DEFAULT_CONFIG, loaded);
        // Settings the cockpit no longer has (API base URLs now come from cockpit.yaml).
        const infra = merged.infrastructure as unknown as Record<string, unknown>;
        const removed = Object.keys(infra).filter((k) => !(k in DEFAULT_CONFIG.infrastructure) && k !== 'dockerPath');
        for (const k of removed) delete infra[k];
        const keys = options.migrateKeys?.(merged) ?? { config: merged, changed: false };
        const config = keys.config;
        this.config = config;
        if (removed.length || keys.changed) {
          await this.save(config);
          if (keys.changed) console.info('[config] moved plain-text AI keys into the encrypted key store');
        }
      } else {
        await this.save(this.config);
      }
    } catch {
      this.config = { ...DEFAULT_CONFIG };
    }
    return this.config;
  }

  async save(config: CockpitConfig): Promise<void> {
    this.config = config;
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    fs.writeFileSync(this.configFile, JSON.stringify(config, null, 2), 'utf-8');
  }

  getConfig(): CockpitConfig {
    // Workspace precedence: COCKPIT_WORKSPACE_ROOT (env) > an explicitly saved path > auto-detected
    // repo. Then the project's cockpit.yaml replaces the project settings it states.
    // Memoised: callers cache services on the identity of the returned object, so the same inputs
    // must give the same object.
    const user = this.config;
    const env = process.env.COCKPIT_WORKSPACE_ROOT;
    const project = this.project.get();
    const m = this.memo;
    if (m && m.user === user && m.env === env && m.project === project) return m.result;
    const result = applyProjectConfig(this.userConfig(), project);
    this.memo = { user, env, project, result };
    return result;
  }

  private memo: { user: CockpitConfig; env: string | undefined; project: ProjectConfigResult; result: CockpitConfig } | null = null;

  /** The project's `cockpit.yaml` as last read: the validated config, its errors, whether it exists. */
  getProject(): ProjectConfigResult {
    return this.project.get();
  }

  private userConfig(): CockpitConfig {
    return resolveWorkspaceRoot(withWorkspaceOverride(this.config));
  }

  getConfigDir(): string {
    return this.configDir;
  }

  getWorkspaceRoot(): string {
    return this.getConfig().general.workspaceRoot;
  }

  getKnowledgeBasePath(): string {
    const config = this.getConfig();
    const kbRoot = config.knowledgeBase.rootPath;
    if (path.isAbsolute(kbRoot)) return kbRoot;
    return path.join(config.general.workspaceRoot, kbRoot);
  }

  private merge(defaults: CockpitConfig, overrides: Partial<CockpitConfig>): CockpitConfig {
    const result = { ...defaults };
    for (const key of Object.keys(overrides) as (keyof CockpitConfig)[]) {
      if (overrides[key] && typeof overrides[key] === 'object' && !Array.isArray(overrides[key])) {
        (result as any)[key] = { ...(defaults as any)[key], ...(overrides as any)[key] };
      } else if (overrides[key] !== undefined) {
        (result as any)[key] = overrides[key];
      }
    }
    return result;
  }
}
