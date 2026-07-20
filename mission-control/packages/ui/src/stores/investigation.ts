import { create } from 'zustand'
import type { Investigation } from '../types/index.js'
import { api } from '../api/client.js'

interface InvestigationState {
  investigations: Investigation[]
  activeInvestigation: Investigation | null
  loading: boolean
  fetchInvestigations: () => Promise<void>
  startInvestigation: (symptom: string) => Promise<void>
  selectInvestigation: (id: string) => Promise<void>
  pollActive: () => Promise<void>
}

export const useInvestigationStore = create<InvestigationState>((set, get) => ({
  investigations: [],
  activeInvestigation: null,
  loading: false,
  fetchInvestigations: async () => {
    const investigations = await api.investigations.list()
    set({ investigations })
  },
  startInvestigation: async (symptom: string) => {
    set({ loading: true })
    const result = await api.investigations.start(symptom)
    const investigation = await api.investigations.get(result.id)
    set({ activeInvestigation: investigation, loading: false })
    await get().fetchInvestigations()
  },
  selectInvestigation: async (id: string) => {
    const investigation = await api.investigations.get(id)
    set({ activeInvestigation: investigation })
  },
  pollActive: async () => {
    const { activeInvestigation } = get()
    if (!activeInvestigation || activeInvestigation.status !== 'running') return
    const updated = await api.investigations.get(activeInvestigation.id)
    set({ activeInvestigation: updated })
    if (updated.status !== 'running') {
      await get().fetchInvestigations()
    }
  },
}))
