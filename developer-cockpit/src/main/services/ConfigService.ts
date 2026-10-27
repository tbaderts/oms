import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CockpitConfig, DEFAULT_CONFIG, LEGACY_SPECS_PATHS } from '../../shared/types/config';

/**
 * Replaces contract paths that are exactly the legacy oms-core defaults (the contracts moved to
 * oms-contracts) with the current defaults. Anything a user customised is kept.
 */
export function migrateConfig(config: CockpitConfig): { config: CockpitConfig; migrated: boolean } {
  const specs = { ...config.specs };
  let migrated = false;
  for (const key of ['openApiPaths', 'avroPaths'] as const) {
    if (JSON.stringify(specs[key]) === JSON.stringify(LEGACY_SPECS_PATHS[key])) {
      specs[key] = [...DEFAULT_CONFIG.specs[key]];
      migrated = true;
    }
  }
  return { config: migrated ? { ...config, specs } : config, migrated };
}

export class ConfigService {
  private config: CockpitConfig = { ...DEFAULT_CONFIG };
  private configFile: string;

  constructor(private configDir: string = path.join(os.homedir(), '.developer-cockpit')) {
    this.configFile = path.join(configDir, 'config.json');
  }

  async load(): Promise<CockpitConfig> {
    try {
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
      }
      if (fs.existsSync(this.configFile)) {
        const raw = fs.readFileSync(this.configFile, 'utf-8');
        const loaded = JSON.parse(raw) as Partial<CockpitConfig>;
        const { config, migrated } = migrateConfig(this.merge(DEFAULT_CONFIG, loaded));
        this.config = config;
        if (migrated) {
          await this.save(config);
          console.info('[config] migrated legacy contract paths to oms-contracts');
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
    return this.config;
  }

  getConfigDir(): string {
    return this.configDir;
  }

  getWorkspaceRoot(): string {
    return this.config.general.workspaceRoot;
  }

  getKnowledgeBasePath(): string {
    const kbRoot = this.config.knowledgeBase.rootPath;
    if (path.isAbsolute(kbRoot)) return kbRoot;
    return path.join(this.config.general.workspaceRoot, kbRoot);
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
