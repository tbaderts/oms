import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import * as k8s from '@kubernetes/client-node'
import { loadConfig } from '../../../services/config.js'

export const getEvents = createTool({
  id: 'k8s-get-events',
  description:
    'Gets recent Kubernetes events in a namespace, optionally filtered by the involved object name. Use this to understand recent cluster activity, diagnose why a pod or deployment is failing, or see warning events from the Kubernetes control plane.',
  inputSchema: z.object({
    namespace: z
      .string()
      .optional()
      .describe(
        'Kubernetes namespace to retrieve events from. Defaults to the configured default namespace.',
      ),
    involvedObjectName: z
      .string()
      .optional()
      .describe(
        'Filter events to those involving a specific object (e.g. a pod or deployment name).',
      ),
    limit: z
      .number()
      .optional()
      .default(50)
      .describe('Maximum number of events to return. Defaults to 50.'),
  }),
  execute: async ({ context: input }) => {
    const config = loadConfig()
    const kc = new k8s.KubeConfig()
    kc.loadFromFile(config.adapters.kubernetes.kubeconfig)
    const coreApi = kc.makeApiClient(k8s.CoreV1Api)

    const namespace =
      input.namespace ?? config.adapters.kubernetes.defaultNamespace
    const limit = input.limit ?? 50

    const fieldSelector = input.involvedObjectName
      ? `involvedObject.name=${input.involvedObjectName}`
      : undefined

    const res = await coreApi.listNamespacedEvent(
      namespace,
      undefined,
      undefined,
      undefined,
      fieldSelector,
      undefined,
      limit,
    )

    const events = res.items
      .map((ev) => ({
        type: ev.type ?? 'Normal',
        reason: ev.reason ?? 'unknown',
        message: ev.message ?? '',
        involvedObject: {
          kind: ev.involvedObject?.kind ?? 'unknown',
          name: ev.involvedObject?.name ?? 'unknown',
          namespace: ev.involvedObject?.namespace ?? namespace,
        },
        count: ev.count ?? 1,
        lastTimestamp: ev.lastTimestamp ?? ev.eventTime ?? null,
      }))
      .sort((a, b) => {
        const aTime = a.lastTimestamp ? new Date(a.lastTimestamp).getTime() : 0
        const bTime = b.lastTimestamp ? new Date(b.lastTimestamp).getTime() : 0
        return bTime - aTime
      })

    return { events, count: events.length, namespace }
  },
})
