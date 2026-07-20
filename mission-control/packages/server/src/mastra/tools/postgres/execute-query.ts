import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import pg from 'pg'
import { loadConfig } from '../../../services/config.js'

export const executeQuery = createTool({
  id: 'pg-execute-query',
  description:
    'Executes a read-only SQL query (SELECT or WITH) against the configured PostgreSQL database. Returns columns, rows, row count, and execution duration. Use this to inspect data, verify state, or investigate issues.',
  inputSchema: z.object({
    query: z
      .string()
      .describe('The SQL query to execute. Only SELECT and WITH queries are allowed.'),
  }),
  outputSchema: z.object({
    columns: z.array(z.string()),
    rows: z.array(z.record(z.unknown())),
    rowCount: z.number(),
    durationMs: z.number(),
  }),
  execute: async (input) => {
    const normalized = input.query.trim().toLowerCase()
    if (!normalized.startsWith('select') && !normalized.startsWith('with')) {
      throw new Error('Only SELECT and WITH queries are allowed.')
    }

    const config = loadConfig()
    const client = new pg.Client({ connectionString: config.adapters.postgresql.connectionString })
    const start = Date.now()
    try {
      await client.connect()
      const result = await client.query(input.query)
      const durationMs = Date.now() - start
      const columns = result.fields.map((f) => f.name)
      const rows = result.rows as Record<string, unknown>[]
      return { columns, rows, rowCount: result.rowCount ?? rows.length, durationMs }
    } finally {
      await client.end()
    }
  },
})
