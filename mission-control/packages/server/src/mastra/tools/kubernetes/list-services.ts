import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import * as k8s from '@kubernetes/client-node'
import { loadConfig } from '../../../services/config.js'

export const listServices = createTool({
  id: 'k8s-list-services',
  description:
    'Lists Kubernetes services in a namespace with their types, cluster IPs, and exposed ports. Use this to discover service endpoints, understand how workloads are exposed, or identify networking configuration.',
  inputSchema: z.object({
    namespace: z
      .string()
      .optional()
      .describe(
        'Kubernetes namespace to list services in. Defaults to the configured default namespace.',
      ),
    labelSelector: z
      .string()
      .optional()
      .describe(
        'Optional label selector to filter services (e.g. "app=my-service").',
      ),
  }),
  execute: async (input) => {
    const config = loadConfig()
    const kc = new k8s.KubeConfig()
    kc.loadFromFile(config.adapters.kubernetes.kubeconfig)
    const coreApi = kc.makeApiClient(k8s.CoreV1Api)

    const namespace =
      input.namespace ?? config.adapters.kubernetes.defaultNamespace

    const res = await coreApi.listNamespacedService({
      namespace,
      labelSelector: input.labelSelector,
    })

    const services = res.items.map((svc) => {
      const ports = (svc.spec?.ports ?? []).map((p) => ({
        name: p.name ?? null,
        port: p.port,
        targetPort: p.targetPort?.toString() ?? null,
        protocol: p.protocol ?? 'TCP',
        nodePort: p.nodePort ?? null,
      }))

      return {
        name: svc.metadata?.name ?? 'unknown',
        namespace: svc.metadata?.namespace ?? namespace,
        type: svc.spec?.type ?? 'ClusterIP',
        clusterIP: svc.spec?.clusterIP ?? 'None',
        ports,
      }
    })

    return { services, count: services.length, namespace }
  },
})
