import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { loadConfig } from '../../../services/config.js'

export const getAlerts = createTool({
  id: 'prom-get-alerts',
  description:
    'Fetches all active and pending alerts from the configured Prometheus instance. Returns alert name, state, severity, summary, and when each alert became active. Useful for quickly identifying ongoing incidents.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    alerts: z.array(
      z.object({
        name: z.string(),
        state: z.string(),
        severity: z.string(),
        summary: z.string(),
        activeAt: z.string(),
      }),
    ),
  }),
  execute: async () => {
    const config = loadConfig()
    const baseUrl = config.adapters.prometheus.url

    const response = await fetch(`${baseUrl}/api/v1/alerts`)
    if (!response.ok) {
      throw new Error(`Prometheus alerts request failed: ${response.status} ${response.statusText}`)
    }

    const body = (await response.json()) as {
      status: string
      data: {
        alerts: Array<{
          labels: Record<string, string>
          annotations: Record<string, string>
          state: string
          activeAt: string
        }>
      }
    }

    if (body.status !== 'success') {
      throw new Error(`Prometheus returned non-success status: ${body.status}`)
    }

    return {
      alerts: body.data.alerts.map((a) => ({
        name: a.labels['alertname'] ?? 'unknown',
        state: a.state,
        severity: a.labels['severity'] ?? 'unknown',
        summary: a.annotations['summary'] ?? a.annotations['message'] ?? '',
        activeAt: a.activeAt,
      })),
    }
  },
})
