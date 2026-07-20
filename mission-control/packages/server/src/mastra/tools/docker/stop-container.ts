import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import Docker from 'dockerode'
import { loadConfig } from '../../../services/config.js'

export const stopContainer = createTool({
  id: 'docker-stop-container',
  description:
    'Stops a running Docker container. This is a destructive action that will terminate the container process — use with care. Requires explicit approval before execution.',
  inputSchema: z.object({
    containerId: z
      .string()
      .describe('Container ID or name to stop.'),
    timeout: z
      .number()
      .optional()
      .default(10)
      .describe(
        'Seconds to wait for graceful shutdown before forcefully killing the container. Defaults to 10.',
      ),
  }),
  requireApproval: true,
  execute: async (input) => {
    const config = loadConfig()
    const docker = new Docker({ socketPath: config.adapters.docker.socketPath })

    const timeout = input.timeout ?? 10
    const container = docker.getContainer(input.containerId)
    await container.stop({ t: timeout })

    const info = await container.inspect()
    return {
      containerId: info.Id.substring(0, 12),
      name: info.Name.replace(/^\//, ''),
      state: info.State.Status,
      finishedAt: info.State.FinishedAt,
    }
  },
})
