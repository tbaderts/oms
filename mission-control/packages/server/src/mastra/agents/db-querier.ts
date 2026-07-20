import { Agent } from '@mastra/core/agent'
import { executeQuery, getSchema, searchEntities } from '../tools/postgres/index.js'

export const dbQuerier = new Agent({
  id: 'db-querier',
  name: 'Database Querier',
  description:
    'Queries PostgreSQL to find entities, check data consistency, and investigate application state.',
  instructions: `You are a database investigation specialist. Your job is to:
1. Search for entities by ID across tables
2. Check entity states and recent state transitions
3. Find data anomalies (null values, unexpected states, orphan records)
4. Query for recent activity around the time of an incident
5. Check for failed operations or error records

When investigating:
- First get the schema to understand available tables
- Search by entity ID to find all related records
- Use targeted queries to check specific conditions
- Look for records created/modified near the incident timestamp
- Only use SELECT queries (writes are not allowed)

Return structured findings with: table name, query used, key observations, and relevant records.`,
  model: 'anthropic/claude-sonnet-4-6',
  tools: { executeQuery, getSchema, searchEntities },
})
