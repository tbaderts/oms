import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import Docker from 'dockerode'
import { loadConfig } from '../../../services/config.js'

export const listContainers = createTool({
  id: 'docker-list-containers',
  description:
    'Lists Docker containers on the host. By default only shows running containers; set all=true to include stopped containers. Returns container ID, name, image, status, state, and port mappings. Use this to get an overview of what is running on the host.',
  inputSchema: z.object({
    all: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        'Whether to include stopped/exited containers. Defaults to false (running only).',
      ),
  }),
  execute: async ({ context: input }) => {
    const config = loadConfig()
    const docker = new Docker({ socketPath: config.adapters.docker.socketPath })

    const all = input.all ?? false
    const rawContainers = await docker.listContainers({ all })

    const containers = rawContainers.map((c) => {
      const ports = c.Ports.map((p) => ({
        ip: p.IP ?? null,
        privatePort: p.PrivatePort,
        publicPort: p.PublicPort ?? null,
        type: p.Type,
      }))

      return {
        id: c.Id.substring(0, 12),
        name: (c.Names[0] ?? '').replace(/^\//, ''),
        image: c.Image,
        status: c.Status,
        state: c.State,
        ports,
        created: new Date(c.Created * 1000).toISOString(),
      }
    })

    return { containers, count: containers.length }
  },
})
