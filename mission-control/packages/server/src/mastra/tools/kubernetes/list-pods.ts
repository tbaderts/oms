import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import * as k8s from '@kubernetes/client-node'
import { loadConfig } from '../../../services/config.js'

function formatAge(creationTimestamp: Date | undefined): string {
  if (!creationTimestamp) return 'unknown'
  const now = new Date()
  const diffMs = now.getTime() - creationTimestamp.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  if (diffSeconds < 60) return `${diffSeconds}s`
  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes}m`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d`
}

export const listPods = createTool({
  id: 'k8s-list-pods',
  description:
    'Lists Kubernetes pods in a namespace. Use this to see running pods, their status, readiness, restart counts, and which node they are scheduled on. Useful for diagnosing deployment issues or monitoring workload health.',
  inputSchema: z.object({
    namespace: z
      .string()
      .optional()
      .describe(
        'Kubernetes namespace to list pods in. Defaults to the configured default namespace.',
      ),
    labelSelector: z
      .string()
      .optional()
      .describe(
        'Optional label selector to filter pods (e.g. "app=my-service").',
      ),
  }),
  execute: async ({ context: input }) => {
    const config = loadConfig()
    const kc = new k8s.KubeConfig()
    kc.loadFromFile(config.adapters.kubernetes.kubeconfig)
    const coreApi = kc.makeApiClient(k8s.CoreV1Api)

    const namespace =
      input.namespace ?? config.adapters.kubernetes.defaultNamespace

    const res = await coreApi.listNamespacedPod(
      namespace,
      undefined,
      undefined,
      undefined,
      undefined,
      input.labelSelector,
    )

    const pods = res.items.map((pod) => {
      const containerStatuses = pod.status?.containerStatuses ?? []
      const readyCount = containerStatuses.filter((cs) => cs.ready).length
      const totalCount = containerStatuses.length
      const restarts = containerStatuses.reduce(
        (sum, cs) => sum + (cs.restartCount ?? 0),
        0,
      )

      return {
        name: pod.metadata?.name ?? 'unknown',
        namespace: pod.metadata?.namespace ?? namespace,
        status: pod.status?.phase ?? 'unknown',
        ready: `${readyCount}/${totalCount}`,
        restarts,
        age: formatAge(pod.metadata?.creationTimestamp),
        node: pod.spec?.nodeName ?? 'unknown',
      }
    })

    return { pods, count: pods.length, namespace }
  },
})
