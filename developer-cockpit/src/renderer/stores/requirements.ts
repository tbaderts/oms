import { create } from 'zustand';
import type { UseCase, FunctionalRequirement, NonFunctionalRequirement, Actor } from '@shared/types/requirements';

interface RequirementsState {
  useCases: UseCase[];
  functionalReqs: FunctionalRequirement[];
  nonFunctionalReqs: NonFunctionalRequirement[];
  actors: Actor[];
  loading: boolean;

  loadUseCases: () => Promise<void>;
  loadFunctionalReqs: () => Promise<void>;
  loadNonFunctionalReqs: () => Promise<void>;
  loadActors: () => Promise<void>;
  loadAll: () => Promise<void>;
}

export const useRequirementsStore = create<RequirementsState>((set) => ({
  useCases: [],
  functionalReqs: [],
  nonFunctionalReqs: [],
  actors: [],
  loading: false,

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
      const [useCases, functionalReqs, nonFunctionalReqs, actors] = await Promise.all([
        api.getUseCases(),
        api.getFunctionalRequirements(),
        api.getNonFunctionalRequirements(),
        api.getActors(),
      ]);
      set({ useCases, functionalReqs, nonFunctionalReqs, actors, loading: false });
    } catch {
      set({ loading: false });
    }
  },
}));
