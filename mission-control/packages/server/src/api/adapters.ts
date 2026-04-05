import { Hono } from 'hono'
import { checkAdapterHealth } from '../services/adapter-health.js'

export const adaptersRouter = new Hono()

adaptersRouter.get('/', async (c) => {
  const statuses = await checkAdapterHealth()
  return c.json(statuses)
})

adaptersRouter.get('/:id/status', async (c) => {
  const statuses = await checkAdapterHealth()
  const status = statuses.find((s) => s.id === c.req.param('id'))
  if (!status) return c.json({ error: 'Unknown adapter' }, 404)
  return c.json(status)
})
