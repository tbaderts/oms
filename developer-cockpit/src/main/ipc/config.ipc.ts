import type { IpcMain } from 'electron';
import type { ConfigService } from '../services/ConfigService';
import type { CockpitConfig } from '../../shared/types/config';
import { isValidEnvVarName } from '../ai/keys';
import { isAcceptableEnvVarField } from '../../shared/envVarName';

/**
 * The config as the renderer may see it: no key, ever (SPEC-0063 AC-3). An env-var "name" that is
 * not a name is a pasted key (left in place only when OS encryption was unavailable); it is
 * redacted to empty (review finding 4).
 */
export function withoutSecrets(config: CockpitConfig): CockpitConfig {
  const pasted = !isAcceptableEnvVarField(config.ai.apiKeyEnvVar);
  if (!('apiKey' in config.ai) && !pasted) return config;
  const ai = { ...config.ai };
  delete ai.apiKey;
  if (pasted) ai.apiKeyEnvVar = '';
  return { ...config, ai };
}

/** `onSaved` lets main react to settings changes, e.g. watching new template files. */
export function registerConfigIpc(ipcMain: IpcMain, configService: ConfigService, onSaved?: (config: CockpitConfig) => void): void {
  ipcMain.handle('config:load', async () => {
    return withoutSecrets(configService.getConfig());
  });

  /**
   * Saves the renderer's settings. Keys never travel this way (AC-4): whatever `ai.apiKey` the
   * renderer sends is ignored, and the main process's own value (normally none; a plain-text
   * leftover only when OS encryption was unavailable, AC-8) is kept. An env-var name that is not a
   * valid name (e.g. a pasted key) is refused and the saved name kept (AC-9).
   */
  ipcMain.handle('config:save', async (_event, incoming: CockpitConfig) => {
    const current = configService.getConfig();
    const ai = { ...incoming.ai };
    delete ai.apiKey;
    let result: { ok: boolean; code?: 'invalid'; message?: string } = { ok: true };
    if (ai.apiKeyEnvVar && !isValidEnvVarName(ai.apiKeyEnvVar)) {
      ai.apiKeyEnvVar = current.ai.apiKeyEnvVar;
      result = { ok: false, code: 'invalid', message: 'The API key environment variable must be a variable name (letters, digits, _), not a key.' };
    }
    if (current.ai.apiKey) ai.apiKey = current.ai.apiKey;
    // The renderer only ever saw a kept pasted key as '' (redacted); sending '' back must not erase
    // it. It stays until the user types a real name, or the next start migrates it (AC-8).
    if (!ai.apiKeyEnvVar && !isAcceptableEnvVarField(current.ai.apiKeyEnvVar)) ai.apiKeyEnvVar = current.ai.apiKeyEnvVar;
    const config = { ...incoming, ai };
    await configService.save(config);
    onSaved?.(config);
    return result;
  });

  ipcMain.handle('config:getWorkspaceRoot', async () => {
    return configService.getWorkspaceRoot();
  });
}
