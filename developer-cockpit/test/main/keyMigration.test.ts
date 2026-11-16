import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { KeyStore } from '../../src/main/ai/KeyStore';
import { migrateAiKeys } from '../../src/main/ai/keyMigration';
import { DEFAULT_CONFIG, type CockpitConfig, type AiConfig } from '../../src/shared/types/config';
import { fakeCrypto } from './keyTestUtils';

const LEGACY_LOCAL = 'vllm-legacy-key-0001';
const PASTED = 'sk-ant-pasted-0123456789';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

function setup(ai: Partial<AiConfig>, opts: { available?: boolean } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-keymig-'));
  dirs.push(dir);
  const logs: string[] = [];
  const store = new KeyStore(dir, fakeCrypto(opts), (m) => logs.push(m));
  const config: CockpitConfig = { ...DEFAULT_CONFIG, ai: { ...DEFAULT_CONFIG.ai, ...ai } };
  const log = (m: string) => logs.push(m);
  return { store, config, logs, log };
}

const noSecretsIn = (logs: string[]) => {
  const text = logs.join('\n');
  expect(text).not.toContain(LEGACY_LOCAL);
  expect(text).not.toContain(PASTED);
};

describe('migrateAiKeys (SPEC-0063 AC-7)', () => {
  it('moves ai.apiKey to the local key, whatever the configured provider', () => {
    const { store, config, logs, log } = setup({ provider: 'anthropic', apiKey: LEGACY_LOCAL, apiKeyEnvVar: 'ANTHROPIC_API_KEY' });
    const res = migrateAiKeys(config, store, log);
    expect(res.changed).toBe(true);
    expect(store.get('local')).toBe(LEGACY_LOCAL);
    expect(store.has('anthropic')).toBe(false);
    expect(res.config.ai.apiKey).toBeUndefined();
    expect('apiKey' in res.config.ai).toBe(false);
    expect(res.config.ai.apiKeyEnvVar).toBe('ANTHROPIC_API_KEY');
    noSecretsIn(logs);
  });

  it('moves a pasted key to the configured provider and resets the variable name', () => {
    const { store, config, logs, log } = setup({ provider: 'anthropic', apiKeyEnvVar: PASTED });
    const res = migrateAiKeys(config, store, log);
    expect(res.changed).toBe(true);
    expect(store.get('anthropic')).toBe(PASTED);
    expect(res.config.ai.apiKeyEnvVar).toBe('ANTHROPIC_API_KEY');
    noSecretsIn(logs);
  });

  it("handles the requester's config: both a legacy local key and a pasted Anthropic key", () => {
    const { store, config, logs, log } = setup({ provider: 'anthropic', apiKey: LEGACY_LOCAL, apiKeyEnvVar: PASTED });
    const res = migrateAiKeys(config, store, log);
    expect(store.get('local')).toBe(LEGACY_LOCAL);
    expect(store.get('anthropic')).toBe(PASTED);
    expect(res.config.ai).not.toHaveProperty('apiKey');
    expect(res.config.ai.apiKeyEnvVar).toBe('ANTHROPIC_API_KEY');
    expect(JSON.stringify(res.config)).not.toContain(PASTED);
    expect(JSON.stringify(res.config)).not.toContain(LEGACY_LOCAL);
    noSecretsIn(logs);
  });

  it('never overwrites a saved key and logs without the value', () => {
    const { store, config, logs, log } = setup({ provider: 'anthropic', apiKey: LEGACY_LOCAL, apiKeyEnvVar: PASTED });
    store.set('local', 'already-saved-local');
    store.set('anthropic', 'already-saved-anthropic');
    const res = migrateAiKeys(config, store, log);
    expect(store.get('local')).toBe('already-saved-local');
    expect(store.get('anthropic')).toBe('already-saved-anthropic');
    expect(res.config.ai).not.toHaveProperty('apiKey');
    expect(res.config.ai.apiKeyEnvVar).toBe('ANTHROPIC_API_KEY');
    expect(logs.filter((l) => l.startsWith('[keys]') && /not migrated|discarded/.test(l))).toHaveLength(2);
    expect(logs.some((l) => l.includes('local'))).toBe(true);
    expect(logs.some((l) => l.includes('anthropic'))).toBe(true);
    noSecretsIn(logs);
  });

  it('a pasted key loses to ai.apiKey for local', () => {
    const { store, config, logs, log } = setup({ provider: 'local', baseUrl: 'http://h/v1', apiKey: LEGACY_LOCAL, apiKeyEnvVar: PASTED });
    const res = migrateAiKeys(config, store, log);
    expect(store.get('local')).toBe(LEGACY_LOCAL);
    // local has no conventional variable: no fallback, never another provider's (review finding 1)
    expect(res.config.ai.apiKeyEnvVar).toBe('');
    expect(logs.some((l) => l.includes('[keys]') && l.includes('local'))).toBe(true);
    noSecretsIn(logs);
  });

  it('a pasted key for openai is stored and the name reset to OPENAI_API_KEY (review finding 8)', () => {
    const { store, config, log } = setup({ provider: 'openai', apiKeyEnvVar: 'sk-openai-pasted' });
    const res = migrateAiKeys(config, store, log);
    expect(store.get('openai')).toBe('sk-openai-pasted');
    expect(res.config.ai.apiKeyEnvVar).toBe('OPENAI_API_KEY');
  });

  it('a pasted key for local without ai.apiKey becomes the local key, with no fallback name (review finding 8)', () => {
    const { store, config, log } = setup({ provider: 'local', baseUrl: 'http://h/v1', apiKeyEnvVar: 'vllm-pasted-key' });
    const res = migrateAiKeys(config, store, log);
    expect(store.get('local')).toBe('vllm-pasted-key');
    expect(res.config.ai.apiKeyEnvVar).toBe('');
  });

  it('when storing fails, the plain-text values stay in config.json (review findings 2, 3)', () => {
    const { store, config, logs, log } = setup({ provider: 'anthropic', apiKey: LEGACY_LOCAL, apiKeyEnvVar: PASTED });
    const failing = { isAvailable: () => true, has: () => false, get: () => undefined, set: () => ({ ok: false as const, code: 'storage-failed' as const }) };
    const res = migrateAiKeys(config, failing, log);
    expect(res.config.ai.apiKey).toBe(LEGACY_LOCAL);
    expect(res.config.ai.apiKeyEnvVar).toBe(PASTED);
    expect(res.changed).toBe(false);
    expect(logs.filter((l) => l.startsWith('[keys]') && /left in config\.json/.test(l))).toHaveLength(2);
    noSecretsIn(logs);
    void store;
  });

  it('a legacy value the store rejects (multi-line) is kept, not discarded (review finding 3)', () => {
    const { store, config, log } = setup({ provider: 'anthropic', apiKey: 'line1\nline2' });
    const res = migrateAiKeys(config, store, log);
    expect(res.config.ai.apiKey).toBe('line1\nline2');
    expect(store.has('local')).toBe(false);
  });

  it('an undecryptable saved key does not block migrating a working plain-text key (review finding 6)', () => {
    const { store, config, log } = setup({ provider: 'anthropic', apiKey: LEGACY_LOCAL });
    const dir = dirs[dirs.length - 1];
    fs.writeFileSync(path.join(dir, 'ai-keys.json'), JSON.stringify({ version: 1, keys: { local: Buffer.from('copied-from-another-machine').toString('base64') } }));
    expect(store.has('local')).toBe(true);
    expect(store.get('local')).toBeUndefined();
    const res = migrateAiKeys(config, store, log);
    expect(store.get('local')).toBe(LEGACY_LOCAL);
    expect(res.config.ai).not.toHaveProperty('apiKey');
  });

  it('is idempotent', () => {
    const { store, config, log } = setup({ provider: 'anthropic', apiKey: LEGACY_LOCAL, apiKeyEnvVar: PASTED });
    const first = migrateAiKeys(config, store, log);
    const second = migrateAiKeys(first.config, store, log);
    expect(second.changed).toBe(false);
    expect(second.config).toEqual(first.config);
    expect(store.get('local')).toBe(LEGACY_LOCAL);
    expect(store.get('anthropic')).toBe(PASTED);
  });

  it('a clean config is unchanged', () => {
    const { store, config, logs, log } = setup({ provider: 'anthropic', apiKeyEnvVar: 'ANTHROPIC_API_KEY' });
    expect(migrateAiKeys(config, store, log)).toEqual({ config, changed: false });
    expect(logs).toEqual([]);
  });

  it('leaves a plain-text key when encryption is unavailable (AC-8)', () => {
    const { store, config, logs, log } = setup({ provider: 'anthropic', apiKey: LEGACY_LOCAL, apiKeyEnvVar: PASTED }, { available: false });
    const res = migrateAiKeys(config, store, log);
    expect(res.changed).toBe(false);
    expect(res.config.ai.apiKey).toBe(LEGACY_LOCAL);
    expect(res.config.ai.apiKeyEnvVar).toBe(PASTED);
    expect(store.has('local')).toBe(false);
    expect(logs.some((l) => l.includes('[keys]') && /encryption is unavailable/i.test(l))).toBe(true);
    noSecretsIn(logs);
  });
});
