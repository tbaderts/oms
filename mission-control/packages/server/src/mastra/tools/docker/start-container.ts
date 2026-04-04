import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import Docker from 'dockerode'
import { loadConfig } from '../../../services/config.js'

export const startContainer = createTool({
  id: 'docker-start-container',
  description:
    'Starts a stopped Docker container. This is a destructive action that changes the state of a container on the host — use with care. Requires explicit approval before execution.',
  inputSchema: z.object({
    containerId: z
      .string()
      .describe('Container ID or name to start.'),
  }),
  requireApproval: true,
  execute: async ({ context: input }) => {
    const config = loadConfig()
    const docker = new Docker({ socketPath: config.adapters.docker.socketPath })

    const container = docker.getContainer(input.containerId)
    await container.start()

    const info = await container.inspect()
    return {
      containerId: info.Id.substring(0, 12),
      name: info.Name.replace(/^\//, ''),
      state: info.State.Status,
      started: info.State.StartedAt,
    }
  },
})
