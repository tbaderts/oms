import { Mastra } from '@mastra/core'
import { LibSQLStore } from '@mastra/libsql'

import { investigationSupervisor } from './agents/investigation-supervisor.js'
import { logAnalyzer } from './agents/log-analyzer.js'
import { k8sInspector } from './agents/k8s-inspector.js'
import { dbQuerier } from './agents/db-querier.js'
import { metricsAnalyzer } from './agents/metrics-analyzer.js'

import * as k8sTools from './tools/kubernetes/index.js'
import * as dockerTools from './tools/docker/index.js'
import * as pgTools from './tools/postgres/index.js'
import * as promTools from './tools/prometheus/index.js'
import * as sharedTools from './tools/shared/index.js'

export const mastra = new Mastra({
  agents: {
    investigationSupervisor,
    logAnalyzer,
    k8sInspector,
    dbQuerier,
    metricsAnalyzer,
  },
  tools: {
    ...k8sTools,
    ...dockerTools,
    ...pgTools,
    ...promTools,
    ...sharedTools,
  },
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
