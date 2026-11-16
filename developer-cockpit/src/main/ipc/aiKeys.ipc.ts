import type { IpcMain } from 'electron';
import type { ConfigService } from '../services/ConfigService';
import type { KeyStore } from '../ai/KeyStore';
import { isValidEnvVarName, resolveApiKey } from '../ai/keys';
import { AI_PROVIDERS, type AiKeySetResult, type AiKeyStatus, type AiProviderId } from '../../shared/types/ai';

export interface AiKeysIpcDeps {
  keyStore: KeyStore;
  configService: ConfigService;
  env?: NodeJS.ProcessEnv;
}

const isProvider = (p: unknown): p is AiProviderId => typeof p === 'string' && (AI_PROVIDERS as readonly string[]).includes(p);
const invalid = (message: string): AiKeySetResult => ({ ok: false, code: 'invalid', message });

/**
 * Provider keys over IPC (SPEC-0063): the renderer can set, clear and ask for status. No channel
 * ever returns a key (AC-3); every channel answers with a value, never a rejected promise.
 */
export function registerAiKeysIpc(ipcMain: IpcMain, deps: AiKeysIpcDeps): void {
  const env = deps.env ?? process.env;

  ipcMain.handle('ai:keys:status', (): AiKeyStatus => {
    const ai = deps.configService.getConfig().ai;
    const saved = Object.fromEntries(AI_PROVIDERS.map((p) => [p, deps.keyStore.has(p)])) as Record<AiProviderId, boolean>;
    const { source } = resolveApiKey(ai, deps.keyStore, env);
    // A "name" that is not a name is a pasted key: never echo it (review finding 4).
    const envVar = isValidEnvVarName(ai.apiKeyEnvVar) ? ai.apiKeyEnvVar : '';
    return { available: deps.keyStore.isAvailable(), saved, active: { provider: ai.provider, source, envVar } };
  });

  ipcMain.handle('ai:keys:set', (_e, provider: unknown, key: unknown): AiKeySetResult => {
    if (!isProvider(provider)) return invalid('Unknown provider.');
    if (typeof key !== 'string') return invalid('The key must be a string.');
    return deps.keyStore.set(provider, key);
  });

  ipcMain.handle('ai:keys:clear', (_e, provider: unknown): AiKeySetResult => {
    if (!isProvider(provider)) return invalid('Unknown provider.');
    return deps.keyStore.clear(provider);
  });
}
