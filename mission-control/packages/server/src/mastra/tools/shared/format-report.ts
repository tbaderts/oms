import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

export const formatReport = createTool({
  id: 'format-report',
  description:
    'Format investigation findings into a structured report with root cause, evidence, timeline, and recommendations.',
  inputSchema: z.object({
    rootCause: z.string().describe('Root cause summary.'),
    evidence: z.array(
      z.object({
        source: z.string(),
        finding: z.string(),
        data: z.string().optional(),
      }),
    ),
    timeline: z.array(
      z.object({
        timestamp: z.string(),
        event: z.string(),
      }),
    ),
    recommendations: z.array(z.string()),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
  }),
  outputSchema: z.object({ report: z.string() }),
  execute: async (input) => {
    const lines: string[] = [
      `# Investigation Report`,
      ``,
      `**Severity:** ${input.severity.toUpperCase()}`,
      ``,
      `## Root Cause`,
      input.rootCause,
      ``,
      `## Evidence`,
    ]
    for (const e of input.evidence) {
      lines.push(`- **${e.source}:** ${e.finding}`)
      if (e.data) lines.push(`  \`\`\`\n  ${e.data}\n  \`\`\``)
    }
    lines.push(``, `## Timeline`)
    for (const t of input.timeline) {
      lines.push(`- **${t.timestamp}** -- ${t.event}`)
    }
    lines.push(``, `## Recommendations`)
    for (const r of input.recommendations) {
      lines.push(`- ${r}`)
    }
    return { report: lines.join('\n') }
  },
})
