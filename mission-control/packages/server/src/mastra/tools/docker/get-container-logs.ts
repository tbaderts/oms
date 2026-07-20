import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import Docker from 'dockerode'
import { loadConfig } from '../../../services/config.js'

export const getContainerLogs = createTool({
  id: 'docker-get-container-logs',
  description:
    'Reads logs from a Docker container with timestamps. Use this to diagnose application errors, startup failures, or unexpected behavior by examining container output. Supports limiting output volume with tail and filtering recent entries with since.',
  inputSchema: z.object({
    containerId: z
      .string()
      .describe('Container ID or name to read logs from.'),
    tail: z
      .number()
      .optional()
      .default(200)
      .describe('Number of log lines to return from the end. Defaults to 200.'),
    since: z
      .number()
      .optional()
      .describe(
        'Unix timestamp; only return logs since this time. Useful for filtering recent activity.',
      ),
  }),
  execute: async (input) => {
    const config = loadConfig()
    const docker = new Docker({ socketPath: config.adapters.docker.socketPath })

    const tail = input.tail ?? 200
    const container = docker.getContainer(input.containerId)

    const stream = await container.logs({
      stdout: true,
      stderr: true,
      tail,
      since: input.since,
      timestamps: true,
    })

    // dockerode returns a Buffer for non-streaming calls
    const raw = stream instanceof Buffer ? stream : Buffer.from(stream as unknown as string)

    // Strip Docker multiplexed stream headers (8-byte header per chunk)
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

    const logs = lines.join('').trimEnd()
    const lineCount = logs ? logs.split('\n').filter(Boolean).length : 0

    return { logs, lineCount }
  },
})
