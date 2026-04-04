import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import * as k8s from '@kubernetes/client-node'
import { loadConfig } from '../../../services/config.js'

export const getPodLogs = createTool({
  id: 'k8s-get-pod-logs',
  description:
    'Reads logs from a Kubernetes pod container. Use this to diagnose application errors, startup failures, or unexpected behavior by examining the pod output. Supports limiting log volume with tailLines and filtering recent entries with sinceSeconds.',
  inputSchema: z.object({
    name: z.string().describe('Name of the pod to read logs from.'),
    namespace: z
      .string()
      .optional()
      .describe(
        'Kubernetes namespace where the pod lives. Defaults to the configured default namespace.',
      ),
    container: z
      .string()
      .optional()
      .describe(
        'Container name within the pod. Required if the pod has multiple containers.',
      ),
    tailLines: z
      .number()
      .optional()
      .default(200)
      .describe('Number of log lines to return from the end. Defaults to 200.'),
    sinceSeconds: z
      .number()
      .optional()
      .describe(
        'Return logs newer than this many seconds. Useful for recent activity only.',
      ),
  }),
  execute: async ({ context: input }) => {
    const config = loadConfig()
    const kc = new k8s.KubeConfig()
    kc.loadFromFile(config.adapters.kubernetes.kubeconfig)
    const coreApi = kc.makeApiClient(k8s.CoreV1Api)

    const namespace =
      input.namespace ?? config.adapters.kubernetes.defaultNamespace
    const tailLines = input.tailLines ?? 200

    const res = await coreApi.readNamespacedPodLog(
      input.name,
      namespace,
      input.container,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      input.sinceSeconds,
      tailLines,
      undefined,
    )

    const logs = typeof res === 'string' ? res : String(res)
    const lineCount = logs ? logs.split('\n').filter(Boolean).length : 0

    return { logs, lineCount }
  },
})
