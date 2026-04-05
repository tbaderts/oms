import { Hono } from 'hono'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadPlaybooks } from '../services/playbooks.js'
import { loadConfig } from '../services/config.js'

export const playbooksRouter = new Hono()

playbooksRouter.get('/', (c) => {
  const playbooks = loadPlaybooks()
  return c.json(playbooks.map((p) => ({ title: p.title, triggers: p.triggers, priority: p.priority, filePath: p.filePath })))
})

playbooksRouter.get('/:index', (c) => {
  const playbooks = loadPlaybooks()
  const idx = Number(c.req.param('index'))
  if (idx < 0 || idx >= playbooks.length) return c.json({ error: 'Not found' }, 404)
  return c.json(playbooks[idx])
})

playbooksRouter.post('/', async (c) => {
  const body = await c.req.json<{ filename: string; content: string }>()
  if (!body.filename || !body.content) return c.json({ error: 'filename and content are required' }, 400)
  const basename = body.filename.replace(/[^a-zA-Z0-9._-]/g, '')
  if (!basename) return c.json({ error: 'Invalid filename' }, 400)
  const config = loadConfig()
  const filePath = join(config.playbooks.path, basename.endsWith('.md') ? basename : `${basename}.md`)
  writeFileSync(filePath, body.content)
  return c.json({ filePath }, 201)
})
