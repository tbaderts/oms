import type { AdapterStatus, Investigation, Playbook, MissionControlConfig } from '../types/index.js'

const BASE = '/mc'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`)
  return res.json() as Promise<T>
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`POST ${path}: ${res.status}`)
  return res.json() as Promise<T>
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PUT ${path}: ${res.status}`)
  return res.json() as Promise<T>
}

export const api = {
  adapters: {
    list: () => get<AdapterStatus[]>('/adapters'),
    status: (id: string) => get<AdapterStatus>(`/adapters/${id}/status`),
  },
  investigations: {
    list: () => get<Investigation[]>('/investigations'),
    get: (id: string) => get<Investigation>(`/investigations/${id}`),
    start: (symptom: string) => post<{ id: string; status: string }>('/investigations', { symptom }),
  },
  playbooks: {
    list: () => get<Playbook[]>('/playbooks'),
    create: (filename: string, content: string) => post<{ filePath: string }>('/playbooks', { filename, content }),
  },
  config: {
    get: () => get<MissionControlConfig>('/config'),
    update: (config: Partial<MissionControlConfig>) => put<{ success: boolean }>('/config', config),
  },
}
