import { create } from 'zustand';
import type { DockerContainer } from '@shared/types/docker';

interface DockerState {
  containers: DockerContainer[] | null;
  error: string | null;
  /** True when the last refresh failed but we have a previous good list. */
  connectionLost: boolean;
  disabled: boolean;
  /** The currently selected container for the log panel, or null. */
  logsContainer: string | null;
  logs: string | null;
  logsError: string | null;

  /** Loads the container list from the Docker daemon. */
  load: () => Promise<void>;
  /** Opens the log panel for a container. */
  showLogs: (container: string) => Promise<void>;
  /** Closes the log panel. */
  clearLogs: () => void;
  /** Marks the feature as disabled (dockerEnabled: false). */
  setDisabled: (disabled: boolean) => void;
}

export const useDockerStore = create<DockerState>((set, get) => ({
  containers: null,
  error: null,
  connectionLost: false,
  disabled: false,
  logsContainer: null,
  logs: null,
  logsError: null,

  load: async () => {
    const ai = window.cockpit?.docker;
    if (!ai) {
      set({ error: 'The Docker feature is not available in this build.' });
      return;
    }
    try {
      const result = await ai.list();
      if (result.ok && result.containers) {
        set({ containers: result.containers, error: null, connectionLost: false });
      } else if (result.code === 'disabled') {
        set({ disabled: true });
      } else {
        // Distinguish between "never connected" and "transient failure":
        // if we have a previous good list, mark connectionLost; otherwise show the error.
        const prev = get().containers;
        if (prev) {
          set({ connectionLost: true, error: result.message ?? null });
        } else {
          set({ error: result.message ?? 'Docker is not reachable.', connectionLost: false });
        }
      }
    } catch (e) {
      const prev = get().containers;
      if (prev) {
        set({ connectionLost: true, error: e instanceof Error ? e.message : null });
      } else {
        set({ error: e instanceof Error ? e.message : 'Failed to query Docker.' });
      }
    }
  },

  showLogs: async (container: string) => {
    const ai = window.cockpit?.docker;
    if (!ai) {
      set({ logsContainer: container, logsError: 'The Docker feature is not available in this build.' });
      return;
    }
    set({ logsContainer: container, logs: null, logsError: null });
    try {
      const result = await ai.logs(container, 200);
      if (result.ok) {
        set({ logs: result.logs ?? '' });
      } else {
        set({ logsError: result.message ?? 'Could not fetch logs.' });
      }
    } catch (e) {
      set({ logsError: e instanceof Error ? e.message : 'Could not fetch logs.' });
    }
  },

  clearLogs: () => set({ logsContainer: null, logs: null, logsError: null }),
  setDisabled: (disabled) => set({ disabled }),
}));
