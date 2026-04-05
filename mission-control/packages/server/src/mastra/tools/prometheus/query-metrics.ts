import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { loadConfig } from '../../../services/config.js'

export const queryMetrics = createTool({
  id: 'prom-query-metrics',
  description:
    'Executes an instant PromQL query against the configured Prometheus instance. Returns the result type and a list of metric series with their labels and current value. Use for point-in-time metric lookups.',
  inputSchema: z.object({
    query: z.string().describe('The PromQL expression to evaluate.'),
    time: z
      .string()
      .optional()
      .describe(
        'Optional evaluation timestamp in RFC3339 or Unix timestamp format. Defaults to current server time.',
      ),
  }),
  outputSchema: z.object({
    resultType: z.string(),
    results: z.array(
      z.object({
        metric: z.record(z.string()),
        value: z.string(),
        timestamp: z.number(),
      }),
    ),
  }),
  execute: async (input) => {
    const config = loadConfig()
    const baseUrl = config.adapters.prometheus.url

    const params = new URLSearchParams({ query: input.query })
    if (input.time) params.set('time', input.time)

    const response = await fetch(`${baseUrl}/api/v1/query?${params.toString()}`)
    if (!response.ok) {
      throw new Error(`Prometheus query failed: ${response.status} ${response.statusText}`)
    }

    const body = (await response.json()) as {
      status: string
      data: {
        resultType: string
        result: Array<{ metric: Record<string, string>; value: [number, string] }>
      }
    }

    if (body.status !== 'success') {
      throw new Error(`Prometheus returned non-success status: ${body.status}`)
    }

    return {
      resultType: body.data.resultType,
      results: body.data.result.map((r) => ({
        metric: r.metric,
        value: r.value[1],
        timestamp: r.value[0],
      })),
    }
  },
})
