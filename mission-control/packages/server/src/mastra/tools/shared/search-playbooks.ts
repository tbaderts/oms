import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { loadPlaybooks, matchPlaybook } from '../../../services/playbooks.js'

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
    const all = loadPlaybooks()
    const lowerSymptom = input.symptom.toLowerCase()
    const match = all
      .filter((p) => p.triggers.some((t) => lowerSymptom.includes(t.toLowerCase())))
      .sort((a, b) => b.priority - a.priority)[0]
    const availablePlaybooks = all.map((p) => p.title)

    if (match) {
      return {
        found: true,
        playbook: { title: match.title, content: match.content, triggers: match.triggers },
        availablePlaybooks,
      }
    }
    return { found: false, availablePlaybooks }
  },
})
