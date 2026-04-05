import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import * as k8s from '@kubernetes/client-node'
import { loadConfig } from '../../../services/config.js'

export const getPodStatus = createTool({
  id: 'k8s-get-pod-status',
  description:
    'Gets detailed status for a specific Kubernetes pod including conditions, container states, and last termination reasons. Use this when you need to investigate why a pod is not running correctly or understand the exact state of its containers.',
  inputSchema: z.object({
    name: z.string().describe('Name of the pod to inspect.'),
    namespace: z
      .string()
      .optional()
      .describe(
        'Kubernetes namespace where the pod lives. Defaults to the configured default namespace.',
      ),
  }),
  execute: async (input) => {
    const config = loadConfig()
    const kc = new k8s.KubeConfig()
    kc.loadFromFile(config.adapters.kubernetes.kubeconfig)
    const coreApi = kc.makeApiClient(k8s.CoreV1Api)

    const namespace =
      input.namespace ?? config.adapters.kubernetes.defaultNamespace

    const res = await coreApi.readNamespacedPod({ name: input.name, namespace })
    const pod = res

    const conditions = (pod.status?.conditions ?? []).map((c) => ({
      type: c.type,
      status: c.status,
      reason: c.reason ?? null,
      message: c.message ?? null,
    }))

    const containers = (pod.status?.containerStatuses ?? []).map((cs) => {
      let state = 'unknown'
      if (cs.state?.running) state = 'running'
      else if (cs.state?.waiting) state = `waiting: ${cs.state.waiting.reason ?? 'unknown'}`
      else if (cs.state?.terminated)
        state = `terminated: ${cs.state.terminated.reason ?? 'unknown'}`

      const lastTerminationReason =
        cs.lastState?.terminated?.reason ?? null

      return {
        name: cs.name,
        ready: cs.ready,
        restartCount: cs.restartCount,
        state,
        lastTerminationReason,
      }
    })

    return {
      name: pod.metadata?.name ?? input.name,
      namespace: pod.metadata?.namespace ?? namespace,
      phase: pod.status?.phase ?? 'unknown',
      message: pod.status?.message ?? null,
      reason: pod.status?.reason ?? null,
      conditions,
      containers,
    }
  },
})
