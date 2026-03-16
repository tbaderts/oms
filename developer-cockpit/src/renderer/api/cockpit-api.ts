import type { CockpitAPI } from '@shared/types/ipc';

declare global {
  interface Window {
    cockpit: CockpitAPI;
  }
}

export function getCockpitApi(): CockpitAPI {
  return window.cockpit;
}
