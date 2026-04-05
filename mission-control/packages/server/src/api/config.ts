import { Hono } from 'hono'
import { loadConfig, saveConfig } from '../services/config.js'

export const configRouter = new Hono()

configRouter.get('/', (c) => {
  const config = loadConfig()
  const masked = {
    ...config,
    ai: { ...config.ai, apiKey: config.ai.apiKey ? '***' : '' },
    adapters: {
      ...config.adapters,
      postgresql: {
        ...config.adapters.postgresql,
        connectionString: config.adapters.postgresql.connectionString ? '***' : '',
      },
    },
  }
  return c.json(masked)
})

configRouter.put('/', async (c) => {
  const body = await c.req.json()
  const current = loadConfig()
  const merged = { ...current, ...body }
  saveConfig(merged)
  return c.json({ success: true })
})
