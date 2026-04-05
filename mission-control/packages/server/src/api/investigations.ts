import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { mastra } from '../mastra/index.js'
import { saveInvestigation, loadInvestigation, listInvestigations, type Investigation } from '../services/investigations.js'

export const investigationsRouter = new Hono()

investigationsRouter.get('/', (c) => {
  const investigations = listInvestigations()
  return c.json(investigations)
})

investigationsRouter.get('/:id', (c) => {
  const investigation = loadInvestigation(c.req.param('id'))
  if (!investigation) return c.json({ error: 'Not found' }, 404)
  return c.json(investigation)
})

investigationsRouter.post('/', async (c) => {
  const body = await c.req.json<{ symptom: string }>()
  const id = `inv-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`

  const investigation: Investigation = {
    id,
    symptom: body.symptom,
    startedAt: new Date().toISOString(),
    status: 'running',
  }
  saveInvestigation(investigation)

  const supervisor = mastra.getAgent('investigationSupervisor')

  // Run investigation asynchronously
  supervisor.generate(body.symptom)
    .then((result) => {
      investigation.status = 'completed'
      investigation.completedAt = new Date().toISOString()
      if (result.text) {
        investigation.report = { rootCause: result.text, evidence: [], timeline: [], recommendations: [] }
      }
      saveInvestigation(investigation)
    })
    .catch((err) => {
      console.error(`Investigation ${id} failed:`, err)
      investigation.status = 'failed'
      investigation.completedAt = new Date().toISOString()
      saveInvestigation(investigation)
    })

  return c.json({ id, status: 'running' }, 201)
})
