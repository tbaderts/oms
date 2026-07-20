import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface MissionControlConfig {
  server: { port: number }
  ai: {
    provider: string
    model: string
    apiKey: string
  }
  adapters: {
    kubernetes: { enabled: boolean; kubeconfig: string; defaultNamespace: string }
    docker: { enabled: boolean; socketPath: string }
    postgresql: { enabled: boolean; connectionString: string }
    prometheus: { enabled: boolean; url: string }
  }
  playbooks: { path: string }
  workflows: { path: string }
  investigations: { path: string }
}

const CONFIG_DIR = join(homedir(), '.mission-control')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

const DEFAULT_CONFIG: MissionControlConfig = {
  server: { port: 3100 },
  ai: {
    provider: 'anthropic',
    model: 'anthropic/claude-sonnet-4-6',
    apiKey: process.env.MC_AI_API_KEY ?? '',
  },
  adapters: {
    kubernetes: {
      enabled: true,
      kubeconfig: join(homedir(), '.kube', 'config'),
      defaultNamespace: 'default',
    },
    docker: {
      enabled: true,
      socketPath: '/var/run/docker.sock',
    },
    postgresql: {
      enabled: false,
      connectionString: process.env.MC_PG_CONNECTION ?? '',
    },
    prometheus: {
      enabled: false,
      url: 'http://localhost:9090',
    },
  },
  playbooks: { path: join(CONFIG_DIR, 'playbooks') },
  workflows: { path: join(CONFIG_DIR, 'workflows') },
  investigations: { path: join(CONFIG_DIR, 'investigations') },
}

export function ensureConfigDirs(): void {
  const dirs = [
    CONFIG_DIR,
    DEFAULT_CONFIG.playbooks.path,
    DEFAULT_CONFIG.workflows.path,
    DEFAULT_CONFIG.investigations.path,
  ]
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
  }
}

export function loadConfig(): MissionControlConfig {
  ensureConfigDirs()
  if (!existsSync(CONFIG_FILE)) {
    writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2))
    return DEFAULT_CONFIG
  }
  const raw = readFileSync(CONFIG_FILE, 'utf-8')
  const userConfig = JSON.parse(raw) as Partial<MissionControlConfig>
  return { ...DEFAULT_CONFIG, ...userConfig }
}

export function saveConfig(config: MissionControlConfig): void {
  ensureConfigDirs()
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
}
