import { create } from 'zustand';
import type { CockpitConfig } from '@shared/types/config';
import { DEFAULT_CONFIG } from '@shared/types/config';

interface ConfigState {
  config: CockpitConfig;
  loaded: boolean;
  loading: boolean;
  loadConfig: () => Promise<void>;
  saveConfig: (config: CockpitConfig) => Promise<void>;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

function applyTheme(theme: 'light' | 'dark' | 'system'): void {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');

  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.add(prefersDark ? 'dark' : 'light');
  } else {
    root.classList.add(theme);
  }
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  config: DEFAULT_CONFIG,
  loaded: false,
  loading: false,

  loadConfig: async () => {
    set({ loading: true });
    try {
      const config = await window.cockpit.config.load();
      set({ config, loaded: true, loading: false });
      applyTheme(config.general.theme);
    } catch {
      set({ loaded: true, loading: false });
      applyTheme(DEFAULT_CONFIG.general.theme);
    }
  },

  saveConfig: async (config: CockpitConfig) => {
    try {
      await window.cockpit.config.save(config);
      set({ config });
      applyTheme(config.general.theme);
    } catch (err) {
      console.error('Failed to save config:', err);
    }
  },

  setTheme: (theme) => {
    const config = { ...get().config, general: { ...get().config.general, theme } };
    get().saveConfig(config);
  },
}));
