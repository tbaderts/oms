import { create } from 'zustand';
import type { Capability, UseCase, FunctionalRequirement, NonFunctionalRequirement, Actor } from '@shared/types/requirements';

interface RequirementsState {
  capabilities: Capability[];
  useCases: UseCase[];
  functionalReqs: FunctionalRequirement[];
  nonFunctionalReqs: NonFunctionalRequirement[];
  actors: Actor[];
  loading: boolean;

  loadCapabilities: () => Promise<void>;
  loadUseCases: () => Promise<void>;
  loadFunctionalReqs: () => Promise<void>;
  loadNonFunctionalReqs: () => Promise<void>;
  loadActors: () => Promise<void>;
  loadAll: () => Promise<void>;
}

export const useRequirementsStore = create<RequirementsState>((set) => ({
  capabilities: [],
  useCases: [],
  functionalReqs: [],
  nonFunctionalReqs: [],
  actors: [],
  loading: false,

  loadCapabilities: async () => {
    try {
      const capabilities = await window.cockpit.requirements.getCapabilities();
      set({ capabilities });
    } catch { /* ignore */ }
  },

  loadUseCases: async () => {
    try {
      const useCases = await window.cockpit.requirements.getUseCases();
      set({ useCases });
    } catch { /* ignore */ }
  },

  loadFunctionalReqs: async () => {
    try {
      const functionalReqs = await window.cockpit.requirements.getFunctionalRequirements();
      set({ functionalReqs });
    } catch { /* ignore */ }
  },

  loadNonFunctionalReqs: async () => {
    try {
      const nonFunctionalReqs = await window.cockpit.requirements.getNonFunctionalRequirements();
      set({ nonFunctionalReqs });
    } catch { /* ignore */ }
  },

  loadActors: async () => {
    try {
      const actors = await window.cockpit.requirements.getActors();
      set({ actors });
    } catch { /* ignore */ }
  },

  loadAll: async () => {
    set({ loading: true });
    const api = window.cockpit.requirements;
    try {
      const [capabilities, useCases, functionalReqs, nonFunctionalReqs, actors] = await Promise.all([
        api.getCapabilities(),
        api.getUseCases(),
        api.getFunctionalRequirements(),
        api.getNonFunctionalRequirements(),
        api.getActors(),
      ]);
      set({ capabilities, useCases, functionalReqs, nonFunctionalReqs, actors, loading: false });
    } catch {
      set({ loading: false });
    }
  },
}));
