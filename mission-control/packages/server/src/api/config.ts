import { Hono } from 'hono'
import { loadConfig, saveConfig, type MissionControlConfig } from '../services/config.js'

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
  const merged = deepMerge(current as unknown as Record<string, unknown>, body as Record<string, unknown>)
  saveConfig(merged as unknown as MissionControlConfig)
  return c.json({ success: true })
})

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])
      && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      result[key] = deepMerge(target[key] as Record<string, unknown>, source[key] as Record<string, unknown>)
    } else {
      result[key] = source[key]
    }
  }
  return result
}
