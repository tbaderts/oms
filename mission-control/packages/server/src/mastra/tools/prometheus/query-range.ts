import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { loadConfig } from '../../../services/config.js'

export const queryRange = createTool({
  id: 'prom-query-range',
  description:
    'Executes a range PromQL query against the configured Prometheus instance. Returns time-series data over a specified time window. Use for trend analysis, charting, or investigating metric changes over time.',
  inputSchema: z.object({
    query: z.string().describe('The PromQL expression to evaluate.'),
    start: z
      .string()
      .describe('Start of the time range in RFC3339 or Unix timestamp format.'),
    end: z
      .string()
      .describe('End of the time range in RFC3339 or Unix timestamp format.'),
    step: z
      .string()
      .optional()
      .default('60s')
      .describe('Query resolution step (e.g. "60s", "5m"). Defaults to "60s".'),
  }),
  outputSchema: z.object({
    resultType: z.string(),
    series: z.array(
      z.object({
        metric: z.record(z.string()),
        values: z.array(
          z.object({
            timestamp: z.number(),
            value: z.string(),
          }),
        ),
      }),
    ),
  }),
  execute: async (input) => {
    const config = loadConfig()
    const baseUrl = config.adapters.prometheus.url

    const params = new URLSearchParams({
      query: input.query,
      start: input.start,
      end: input.end,
      step: input.step ?? '60s',
    })

    const response = await fetch(`${baseUrl}/api/v1/query_range?${params.toString()}`)
    if (!response.ok) {
      throw new Error(`Prometheus range query failed: ${response.status} ${response.statusText}`)
    }

    const body = (await response.json()) as {
      status: string
      data: {
        resultType: string
        result: Array<{ metric: Record<string, string>; values: Array<[number, string]> }>
      }
    }

    if (body.status !== 'success') {
      throw new Error(`Prometheus returned non-success status: ${body.status}`)
    }

    return {
      resultType: body.data.resultType,
      series: body.data.result.map((r) => ({
        metric: r.metric,
        values: r.values.map(([timestamp, value]) => ({ timestamp, value })),
      })),
    }
  },
})
