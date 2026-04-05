import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { loadConfig, ensureConfigDirs } from './config.js'

export interface Investigation {
  id: string
  symptom: string
  playbook?: string
  startedAt: string
  completedAt?: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  report?: {
    rootCause: string
    evidence: Array<{ source: string; finding: string; data?: string }>
    timeline: Array<{ timestamp: string; event: string }>
    recommendations: string[]
  }
}

export function saveInvestigation(investigation: Investigation): void {
  ensureConfigDirs()
  const config = loadConfig()
  const filePath = join(config.investigations.path, `${investigation.id}.json`)
  writeFileSync(filePath, JSON.stringify(investigation, null, 2))
}

export function loadInvestigation(id: string): Investigation | undefined {
  const config = loadConfig()
  const filePath = join(config.investigations.path, `${id}.json`)
  if (!existsSync(filePath)) return undefined
  return JSON.parse(readFileSync(filePath, 'utf-8')) as Investigation
}

export function listInvestigations(): Investigation[] {
  const config = loadConfig()
  const dir = config.investigations.path
  if (!existsSync(dir)) return []
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
  return files.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf-8')) as Investigation)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}
