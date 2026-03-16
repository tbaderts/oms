import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CockpitConfig, DEFAULT_CONFIG } from '../../shared/types/config';

const CONFIG_DIR = path.join(os.homedir(), '.developer-cockpit');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export class ConfigService {
  private config: CockpitConfig = { ...DEFAULT_CONFIG };

  async load(): Promise<CockpitConfig> {
    try {
      if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
      }
      if (fs.existsSync(CONFIG_FILE)) {
        const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
        const loaded = JSON.parse(raw) as Partial<CockpitConfig>;
        this.config = this.merge(DEFAULT_CONFIG, loaded);
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
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  }

  getConfig(): CockpitConfig {
    return this.config;
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
