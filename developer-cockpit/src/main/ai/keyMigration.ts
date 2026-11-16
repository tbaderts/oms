import type { AiProviderId } from '../../shared/types/ai';
import type { CockpitConfig } from '../../shared/types/config';
import { CONVENTIONAL_ENV_VAR, isValidEnvVarName } from './keys';
import type { KeyStore } from './KeyStore';

/**
 * One-time move of plain-text keys out of config.json into the encrypted store (SPEC-0063 AC-7):
 * - `ai.apiKey` becomes the `local` key: Settings only ever offered that field for `local`;
 * - a pasted key in `ai.apiKeyEnvVar` (not a valid variable name) becomes the configured
 *   provider's key, and the field is reset to that provider's usual variable name;
 * - a value never overwrites a working (decryptable) saved key, and a pasted key loses to
 *   `ai.apiKey` for `local`; the losing value is discarded with a warning that names the provider,
 *   never the value;
 * - a value that cannot be stored stays in config.json, with a warning.
 * Without OS encryption nothing changes and a warning is logged (AC-8). Running it again is a no-op.
 */
export function migrateAiKeys(
  config: CockpitConfig,
  store: Pick<KeyStore, 'isAvailable' | 'get' | 'set'>,
  log: (msg: string) => void = console.warn,
): { config: CockpitConfig; changed: boolean } {
  const legacy = typeof config.ai.apiKey === 'string' ? config.ai.apiKey.trim() : '';
  const envVar = config.ai.apiKeyEnvVar ?? '';
  const pasted = envVar && !isValidEnvVarName(envVar) ? envVar.trim() : '';
  if (!legacy && !pasted && !('apiKey' in config.ai)) return { config, changed: false };

  if ((legacy || pasted) && !store.isAvailable()) {
    log('[keys] OS encryption is unavailable; a plain-text key in config.json was left in place');
    return { config, changed: false };
  }

  const ai = { ...config.ai };
  const provider = config.ai.provider as AiProviderId;

  // A value leaves config.json only once it is stored encrypted, or deliberately discarded because a
  // working key already wins. If storing fails, it stays where it was (review findings 2, 3).
  if (legacy) {
    // A saved entry that cannot be decrypted here is no key at all; it must not win (finding 6).
    if (store.get('local')) {
      log('[keys] a plain-text key in config.json was not migrated: a local key is already saved; it was discarded');
      delete ai.apiKey;
    } else if (tryStore(store, 'local', legacy, log)) {
      delete ai.apiKey;
    }
  } else {
    delete ai.apiKey; // an empty leftover field
  }

  if (pasted) {
    let resolved = true;
    if (provider === 'local' && legacy) {
      log('[keys] a key in the environment-variable name field was not migrated: the local key came from config.json; it was discarded');
    } else if (store.get(provider)) {
      log(`[keys] a key in the environment-variable name field was not migrated: a ${provider} key is already saved; it was discarded`);
    } else {
      resolved = tryStore(store, provider, pasted, log);
    }
    // `local` has no conventional variable: no fallback, never another provider's (review finding 1).
    if (resolved) ai.apiKeyEnvVar = CONVENTIONAL_ENV_VAR[provider];
  }

  const changed = ai.apiKey !== config.ai.apiKey || ai.apiKeyEnvVar !== config.ai.apiKeyEnvVar || ('apiKey' in config.ai && !('apiKey' in ai));
  return changed ? { config: { ...config, ai }, changed: true } : { config, changed: false };
}

function tryStore(store: Pick<KeyStore, 'set'>, provider: AiProviderId, key: string, log: (msg: string) => void): boolean {
  const res = store.set(provider, key);
  if (!res.ok) log(`[keys] the ${provider} key could not be stored (${res.code}); it was left in config.json`);
  return res.ok;
}
