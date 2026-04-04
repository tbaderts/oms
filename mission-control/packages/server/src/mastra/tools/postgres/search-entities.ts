import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import pg from 'pg'
import { loadConfig } from '../../../services/config.js'

export const searchEntities = createTool({
  id: 'pg-search-entities',
  description:
    'Searches all tables in the given PostgreSQL schema for rows matching an entity ID. Scans ID-like columns (named "id", ending in "_id" or "Id") of compatible types (varchar, text, uuid, bigint, integer). Returns matching tables, match counts, and sample rows.',
  inputSchema: z.object({
    entityId: z.string().describe('The entity ID value to search for across all tables.'),
    schemaName: z
      .string()
      .optional()
      .default('public')
      .describe('The PostgreSQL schema to search. Defaults to "public".'),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        table: z.string(),
        column: z.string(),
        matchCount: z.number(),
        sampleRows: z.array(z.record(z.unknown())),
      }),
    ),
  }),
  execute: async ({ context: input }) => {
    const config = loadConfig()
    const client = new pg.Client({ connectionString: config.adapters.postgresql.connectionString })
    try {
      await client.connect()

      const schemaName = input.schemaName ?? 'public'

      const columnsResult = await client.query<{
        table_name: string
        column_name: string
        data_type: string
      }>(
        `SELECT table_name, column_name, data_type
         FROM information_schema.columns
         WHERE table_schema = $1
           AND (
             column_name = 'id'
             OR column_name LIKE '%_id'
             OR column_name LIKE '%Id'
           )
           AND data_type IN ('character varying', 'text', 'uuid', 'bigint', 'integer')
         ORDER BY table_name, column_name`,
        [schemaName],
      )

      const results: Array<{
        table: string
        column: string
        matchCount: number
        sampleRows: Record<string, unknown>[]
      }> = []

      for (const col of columnsResult.rows) {
        const tableFqn = `"${schemaName}"."${col.table_name}"`
        const colQuoted = `"${col.column_name}"`

        const countRes = await client.query<{ cnt: string }>(
          `SELECT COUNT(*) AS cnt FROM ${tableFqn} WHERE ${colQuoted}::text = $1`,
          [input.entityId],
        )
        const matchCount = parseInt(countRes.rows[0]?.cnt ?? '0', 10)

        if (matchCount > 0) {
          const sampleRes = await client.query(
            `SELECT * FROM ${tableFqn} WHERE ${colQuoted}::text = $1 LIMIT 5`,
            [input.entityId],
          )
          results.push({
            table: col.table_name,
            column: col.column_name,
            matchCount,
            sampleRows: sampleRes.rows as Record<string, unknown>[],
          })
        }
      }

      return { results }
    } finally {
      await client.end()
    }
  },
})
