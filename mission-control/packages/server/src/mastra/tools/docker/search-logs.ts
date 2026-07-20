import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import Docker from 'dockerode'
import { loadConfig } from '../../../services/config.js'

export const searchLogs = createTool({
  id: 'docker-search-logs',
  description:
    'Searches for a pattern across logs from running Docker containers using a case-insensitive regex. Optionally restrict the search to specific container names. Use this to find error messages, stack traces, or any recurring pattern across multiple services at once.',
  inputSchema: z.object({
    pattern: z
      .string()
      .describe(
        'Case-insensitive regex pattern to search for in container logs (e.g. "error|exception", "OOM").',
      ),
    containerNames: z
      .array(z.string())
      .optional()
      .describe(
        'Optional list of container names to restrict the search to. Searches all running containers if omitted.',
      ),
    tail: z
      .number()
      .optional()
      .default(500)
      .describe(
        'Number of recent log lines to search per container. Defaults to 500.',
      ),
  }),
  execute: async (input) => {
    const config = loadConfig()
    const docker = new Docker({ socketPath: config.adapters.docker.socketPath })

    const tail = input.tail ?? 500
    const regex = new RegExp(input.pattern, 'i')

    const rawContainers = await docker.listContainers({ all: false })
    const filtered = input.containerNames?.length
      ? rawContainers.filter((c) =>
          input.containerNames!.some((n) =>
            c.Names.some((name) => name.replace(/^\//, '') === n),
          ),
        )
      : rawContainers

    const matches: Array<{ container: string; line: string }> = []

    await Promise.all(
      filtered.map(async (c) => {
        const containerName = (c.Names[0] ?? '').replace(/^\//, '')
        try {
          const container = docker.getContainer(c.Id)
          const stream = await container.logs({
            stdout: true,
            stderr: true,
            tail,
            timestamps: false,
          })

          const raw =
            stream instanceof Buffer
              ? stream
              : Buffer.from(stream as unknown as string)

          // Strip Docker multiplexed stream headers
          const lines: string[] = []
          let offset = 0
          while (offset < raw.length) {
            if (offset + 8 > raw.length) break
            const size =
              (raw[offset + 4] << 24) |
              (raw[offset + 5] << 16) |
              (raw[offset + 6] << 8) |
              raw[offset + 7]
            offset += 8
            if (size > 0 && offset + size <= raw.length) {
              lines.push(raw.subarray(offset, offset + size).toString('utf8'))
            }
            offset += size
          }

          const logText = lines.join('')
          for (const line of logText.split('\n')) {
            if (regex.test(line)) {
              matches.push({ container: containerName, line: line.trimEnd() })
            }
          }
        } catch {
          // Ignore containers we cannot read logs from
        }
      }),
    )

    return { matches, totalMatches: matches.length }
  },
})
