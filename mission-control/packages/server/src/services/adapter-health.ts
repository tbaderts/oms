import { loadConfig } from './config.js'
import * as k8s from '@kubernetes/client-node'
import Docker from 'dockerode'
import pg from 'pg'

export interface AdapterStatus {
  id: string
  name: string
  enabled: boolean
  connected: boolean
  error?: string
}

export async function checkAdapterHealth(): Promise<AdapterStatus[]> {
  const config = loadConfig()
  const statuses: AdapterStatus[] = []

  // Kubernetes
  if (config.adapters.kubernetes.enabled) {
    try {
      const kc = new k8s.KubeConfig()
      kc.loadFromFile(config.adapters.kubernetes.kubeconfig)
      const api = kc.makeApiClient(k8s.CoreV1Api)
      await api.listNamespace({ limit: 1 })
      statuses.push({ id: 'kubernetes', name: 'Kubernetes', enabled: true, connected: true })
    } catch (e) {
      statuses.push({ id: 'kubernetes', name: 'Kubernetes', enabled: true, connected: false, error: String(e) })
    }
  } else {
    statuses.push({ id: 'kubernetes', name: 'Kubernetes', enabled: false, connected: false })
  }

  // Docker
  if (config.adapters.docker.enabled) {
    try {
      const docker = new Docker({ socketPath: config.adapters.docker.socketPath })
      await docker.ping()
      statuses.push({ id: 'docker', name: 'Docker', enabled: true, connected: true })
    } catch (e) {
      statuses.push({ id: 'docker', name: 'Docker', enabled: true, connected: false, error: String(e) })
    }
  } else {
    statuses.push({ id: 'docker', name: 'Docker', enabled: false, connected: false })
  }

  // PostgreSQL
  if (config.adapters.postgresql.enabled) {
    const client = new pg.Client({ connectionString: config.adapters.postgresql.connectionString })
    try {
      await client.connect()
      await client.query('SELECT 1')
      statuses.push({ id: 'postgresql', name: 'PostgreSQL', enabled: true, connected: true })
    } catch (e) {
      statuses.push({ id: 'postgresql', name: 'PostgreSQL', enabled: true, connected: false, error: String(e) })
    } finally {
      await client.end().catch(() => {})
    }
  } else {
    statuses.push({ id: 'postgresql', name: 'PostgreSQL', enabled: false, connected: false })
  }

  // Prometheus
  if (config.adapters.prometheus.enabled) {
    try {
      const response = await fetch(`${config.adapters.prometheus.url}/-/healthy`)
      statuses.push({ id: 'prometheus', name: 'Prometheus', enabled: true, connected: response.ok })
    } catch (e) {
      statuses.push({ id: 'prometheus', name: 'Prometheus', enabled: true, connected: false, error: String(e) })
    }
  } else {
    statuses.push({ id: 'prometheus', name: 'Prometheus', enabled: false, connected: false })
  }

  return statuses
}
