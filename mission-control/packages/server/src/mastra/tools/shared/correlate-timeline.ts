import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

export const correlateTimeline = createTool({
  id: 'correlate-timeline',
  description:
    'Correlate findings from multiple investigation steps into a unified chronological timeline.',
  inputSchema: z.object({
    events: z.array(
      z.object({
        timestamp: z.string().describe('ISO 8601 timestamp.'),
        source: z
          .string()
          .describe('Source system, e.g. "kubernetes", "docker-logs", "database", "prometheus".'),
        event: z.string().describe('What happened.'),
        details: z.string().optional().describe('Additional details.'),
        severity: z
          .enum(['info', 'warning', 'error', 'critical'])
          .optional()
          .default('info'),
      }),
    ),
  }),
  outputSchema: z.object({
    timeline: z.array(
      z.object({
        timestamp: z.string(),
        source: z.string(),
        event: z.string(),
        details: z.string().optional(),
        severity: z.string(),
      }),
    ),
    summary: z.string(),
  }),
  execute: async (input) => {
    const sorted = [...input.events].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    const sources = [...new Set(sorted.map((e) => e.source))]
    const errors = sorted.filter((e) => e.severity === 'error' || e.severity === 'critical')
    let summary = `Timeline with ${sorted.length} events from ${sources.join(', ')}.`
    if (errors.length > 0) {
      summary += ` Found ${errors.length} error/critical events.`
    }
    if (sorted.length >= 2) {
      summary += ` Timespan: ${sorted[0].timestamp} to ${sorted[sorted.length - 1].timestamp}.`
    }
    const timeline = sorted.map((e) => ({
      timestamp: e.timestamp,
      source: e.source,
      event: e.event,
      details: e.details,
      severity: e.severity ?? 'info',
    }))
    return { timeline, summary }
  },
})
