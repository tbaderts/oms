import type { AiKeySource, AiProviderId } from '../../shared/types/ai';
import type { AiConfig } from '../../shared/types/config';
import { isValidEnvVarName } from '../../shared/envVarName';

/** Read access to the saved (encrypted) provider keys; `KeyStore` implements it (SPEC-0063). */
export interface SavedKeys {
  get(provider: AiProviderId): string | undefined;
}

/** No saved keys: the default where no store is wired in (tests, legacy callers). */
export const NO_SAVED_KEYS: SavedKeys = { get: () => undefined };

/** The usual environment variable per provider; `local` has none. */
export const CONVENTIONAL_ENV_VAR: Record<AiProviderId, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  local: '',
};

export { isValidEnvVarName } from '../../shared/envVarName';

/**
 * Whether a variable is another provider's conventional one (e.g. `ANTHROPIC_API_KEY` for `local`).
 * The fallback name is a single setting shared by all providers, so without this check switching
 * provider would send one provider's key to another, e.g. the Anthropic key to a remote vLLM host.
 */
export function belongsToAnotherProvider(name: string, provider: AiProviderId): boolean {
  return (Object.entries(CONVENTIONAL_ENV_VAR) as [AiProviderId, string][]).some(([p, v]) => v && v === name && p !== provider);
}

/**
 * The key a run with `config.provider` uses, and where it comes from (AC-2, AC-5):
 * 1. the provider's saved key;
 * 2. the environment variable named in Settings, when that is a valid name and not another
 *    provider's conventional variable;
 * 3. for `local` only, a leftover plain-text `ai.apiKey` (it remains only when OS encryption was
 *    unavailable at migration, AC-8; Settings only ever offered that field for `local`);
 * 4. none.
 */
export function resolveApiKey(config: AiConfig, keys: SavedKeys, env: NodeJS.ProcessEnv): { key?: string; source: AiKeySource } {
  const provider = config.provider as AiProviderId;
  const saved = keys.get(provider);
  if (saved) return { key: saved, source: 'saved' };
  if (isValidEnvVarName(config.apiKeyEnvVar) && !belongsToAnotherProvider(config.apiKeyEnvVar, provider)) {
    const fromEnv = env[config.apiKeyEnvVar];
    if (fromEnv) return { key: fromEnv, source: 'env' };
  }
  if (provider === 'local' && config.apiKey) return { key: config.apiKey, source: 'legacy' };
  return { source: 'none' };
}
