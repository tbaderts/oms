import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import pg from 'pg'
import { loadConfig } from '../../../services/config.js'

export const getSchema = createTool({
  id: 'pg-get-schema',
  description:
    'Retrieves the schema of a PostgreSQL database, listing all tables with their columns (name, type, nullable) and estimated row counts. Useful for understanding the data model before writing queries.',
  inputSchema: z.object({
    schemaName: z
      .string()
      .optional()
      .default('public')
      .describe('The PostgreSQL schema to inspect. Defaults to "public".'),
  }),
  outputSchema: z.object({
    tables: z.array(
      z.object({
        name: z.string(),
        columns: z.array(
          z.object({
            name: z.string(),
            type: z.string(),
            nullable: z.boolean(),
          }),
        ),
        rowCountEstimate: z.number(),
      }),
    ),
  }),
  execute: async ({ context: input }) => {
    const config = loadConfig()
    const client = new pg.Client({ connectionString: config.adapters.postgresql.connectionString })
    try {
      await client.connect()

      const schemaName = input.schemaName ?? 'public'

      const tablesResult = await client.query<{ table_name: string; row_estimate: number }>(
        `SELECT
          c.relname AS table_name,
          c.reltuples::bigint AS row_estimate
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = $1
           AND c.relkind = 'r'
         ORDER BY c.relname`,
        [schemaName],
      )

      const columnsResult = await client.query<{
        table_name: string
        column_name: string
        data_type: string
        is_nullable: string
      }>(
        `SELECT
          table_name,
          column_name,
          data_type,
          is_nullable
         FROM information_schema.columns
         WHERE table_schema = $1
         ORDER BY table_name, ordinal_position`,
        [schemaName],
      )

      const columnsByTable = new Map<
        string,
        Array<{ name: string; type: string; nullable: boolean }>
      >()
      for (const row of columnsResult.rows) {
        if (!columnsByTable.has(row.table_name)) {
          columnsByTable.set(row.table_name, [])
        }
        columnsByTable.get(row.table_name)!.push({
          name: row.column_name,
          type: row.data_type,
          nullable: row.is_nullable === 'YES',
        })
      }

      const tables = tablesResult.rows.map((t) => ({
        name: t.table_name,
        columns: columnsByTable.get(t.table_name) ?? [],
        rowCountEstimate: Number(t.row_estimate),
      }))

      return { tables }
    } finally {
      await client.end()
    }
  },
})
