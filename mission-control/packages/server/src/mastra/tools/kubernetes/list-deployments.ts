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

export const listDeployments = createTool({
  id: 'k8s-list-deployments',
  description:
    'Lists Kubernetes deployments in a namespace with their readiness, up-to-date, and available replica counts. Use this to check the health of deployed services and identify deployments that are not fully rolled out or have unavailable replicas.',
  inputSchema: z.object({
    namespace: z
      .string()
      .optional()
      .describe(
        'Kubernetes namespace to list deployments in. Defaults to the configured default namespace.',
      ),
    labelSelector: z
      .string()
      .optional()
      .describe(
        'Optional label selector to filter deployments (e.g. "app=my-service").',
      ),
  }),
  execute: async ({ context: input }) => {
    const config = loadConfig()
    const kc = new k8s.KubeConfig()
    kc.loadFromFile(config.adapters.kubernetes.kubeconfig)
    const appsApi = kc.makeApiClient(k8s.AppsV1Api)

    const namespace =
      input.namespace ?? config.adapters.kubernetes.defaultNamespace

    const res = await appsApi.listNamespacedDeployment(
      namespace,
      undefined,
      undefined,
      undefined,
      undefined,
      input.labelSelector,
    )

    const deployments = res.items.map((dep) => {
      const desired = dep.spec?.replicas ?? 0
      const ready = dep.status?.readyReplicas ?? 0
      const upToDate = dep.status?.updatedReplicas ?? 0
      const available = dep.status?.availableReplicas ?? 0

      return {
        name: dep.metadata?.name ?? 'unknown',
        namespace: dep.metadata?.namespace ?? namespace,
        ready: `${ready}/${desired}`,
        upToDate,
        available,
        age: formatAge(dep.metadata?.creationTimestamp),
      }
    })

    return { deployments, count: deployments.length, namespace }
  },
})
