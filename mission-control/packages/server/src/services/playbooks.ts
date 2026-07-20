import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { loadConfig } from './config.js'

export interface Playbook {
  title: string
  triggers: string[]
  priority: number
  content: string
  filePath: string
}

export function loadPlaybooks(): Playbook[] {
  const config = loadConfig()
  const dir = config.playbooks.path
  if (!existsSync(dir)) return []
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'))
  return files.map((file) => {
    const filePath = join(dir, file)
    const raw = readFileSync(filePath, 'utf-8')
    const { frontmatter, content } = parseFrontmatter(raw)
    return {
      title: (frontmatter.title as string) ?? file.replace('.md', ''),
      triggers: (frontmatter.triggers as string[]) ?? [],
      priority: (frontmatter.priority as number) ?? 0,
      content,
      filePath,
    }
  })
}

export function matchPlaybook(symptom: string): Playbook | undefined {
  const playbooks = loadPlaybooks()
  const lowerSymptom = symptom.toLowerCase()
  const matches = playbooks
    .filter((p) => p.triggers.some((t) => lowerSymptom.includes(t.toLowerCase())))
    .sort((a, b) => b.priority - a.priority)
  return matches[0]
}

function parseFrontmatter(raw: string): { frontmatter: Record<string, unknown>; content: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return { frontmatter: {}, content: raw }
  const lines = match[1].split('\n')
  const frontmatter: Record<string, unknown> = {}
  for (const line of lines) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    let value: unknown = line.slice(colonIdx + 1).trim()
    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map((s) => s.trim())
    } else if (typeof value === 'string' && !isNaN(Number(value))) {
      value = Number(value)
    }
    frontmatter[key] = value
  }
  return { frontmatter, content: match[2] }
}
