import { create } from 'zustand'
import type { AdapterStatus, Investigation } from '../types/index.js'
import { api } from '../api/client.js'

interface AppState {
  adapters: AdapterStatus[]
  investigations: Investigation[]
  loading: boolean
  fetchAdapters: () => Promise<void>
  fetchInvestigations: () => Promise<void>
}

export const useAppStore = create<AppState>((set) => ({
  adapters: [],
  investigations: [],
  loading: false,
  fetchAdapters: async () => {
    try {
      const adapters = await api.adapters.list()
      set({ adapters })
    } catch {
      set({ adapters: [] })
    }
  },
  fetchInvestigations: async () => {
    set({ loading: true })
    try {
      const investigations = await api.investigations.list()
      set({ investigations, loading: false })
    } catch {
      set({ investigations: [], loading: false })
    }
  },
}))
