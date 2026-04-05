import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { matchPlaybook, loadPlaybooks } from '../../../services/playbooks.js'

export const searchPlaybooks = createTool({
  id: 'search-playbooks',
  description:
    'Search investigation playbooks by symptom keywords. Returns the best matching playbook with investigation steps to follow.',
  inputSchema: z.object({
    symptom: z.string().describe('Symptom description to match against playbook triggers.'),
  }),
  outputSchema: z.object({
    found: z.boolean(),
    playbook: z
      .object({
        title: z.string(),
        content: z.string(),
        triggers: z.array(z.string()),
      })
      .optional(),
    availablePlaybooks: z.array(z.string()),
  }),
  execute: async ({ context: input }) => {
    const match = matchPlaybook(input.symptom)
    const all = loadPlaybooks()
    if (match) {
      return {
        found: true,
        playbook: { title: match.title, content: match.content, triggers: match.triggers },
        availablePlaybooks: all.map((p) => p.title),
      }
    }
    return { found: false, availablePlaybooks: all.map((p) => p.title) }
  },
})
