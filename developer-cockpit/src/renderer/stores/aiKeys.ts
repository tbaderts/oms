import { create } from 'zustand';
import type { AiKeySetResult, AiKeyStatus, AiProviderId } from '@shared/types/ai';

interface AiKeysState {
  status: AiKeyStatus | null;
  /** The last refusal per provider (e.g. encryption unavailable); cleared on the next success. */
  errors: Partial<Record<AiProviderId, string>>;
  load: () => Promise<void>;
  set: (provider: AiProviderId, key: string) => Promise<AiKeySetResult>;
  clear: (provider: AiProviderId) => Promise<AiKeySetResult>;
}

const unavailable: AiKeySetResult = { ok: false, code: 'invalid', message: 'Provider keys are not available in this build.' };

/**
 * Provider keys as the window sees them (SPEC-0063): status only. Keys go in through `set` and are
 * never read back; nothing here keeps a key after the call.
 */
export const useAiKeysStore = create<AiKeysState>((set, get) => ({
  status: null,
  errors: {},

  load: async () => {
    const keys = window.cockpit?.ai?.keys;
    if (!keys) return;
    try {
      set({ status: await keys.status() });
    } catch {
      // status stays unknown; the section shows nothing saved
    }
  },

  set: async (provider, key) => {
    const keys = window.cockpit?.ai?.keys;
    if (!keys) return unavailable;
    // A rejected IPC call is reported on the row, never left unhandled (review finding 7).
    const res = await keys.set(provider, key).catch((): AiKeySetResult => ({ ok: false, code: 'storage-failed', message: 'The key was not saved: the request failed.' }));
    set((s) => ({ errors: { ...s.errors, [provider]: res.ok ? undefined : res.message ?? 'The key was not saved.' } }));
    if (res.ok) await get().load();
    return res;
  },

  clear: async (provider) => {
    const keys = window.cockpit?.ai?.keys;
    if (!keys) return unavailable;
    const res = await keys.clear(provider).catch((): AiKeySetResult => ({ ok: false, code: 'storage-failed', message: 'The key was not cleared: the request failed.' }));
    set((s) => ({ errors: { ...s.errors, [provider]: res.ok ? undefined : res.message ?? 'The key was not cleared.' } }));
    await get().load();
    return res;
  },
}));
