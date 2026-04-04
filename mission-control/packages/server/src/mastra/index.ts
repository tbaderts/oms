import { Mastra } from '@mastra/core'
import { LibSQLStore } from '@mastra/libsql'

export const mastra = new Mastra({
  storage: new LibSQLStore({
    id: 'mission-control-storage',
    url: 'file:./mission-control.db',
  }),
  server: {
    port: 3100,
    cors: {
      origin: ['http://localhost:5173'],
      credentials: true,
    },
    build: {
      swaggerUI: true,
      openAPIDocs: true,
      apiReqLogs: true,
    },
  },
})
