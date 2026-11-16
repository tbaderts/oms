import { describe, expect, it } from 'vitest';
import { NO_SAVED_KEYS, isValidEnvVarName, resolveApiKey, type SavedKeys } from '../../src/main/ai/keys';
import { forConfig } from '../../src/main/ai/adapters';
import { notConfiguredReason } from '../../src/main/ai/AiService';
import { isConfigured } from '../../src/main/storyboards/ai/AiAdapter';
import { aiAvailable } from '../../src/main/storyboards/StoryboardAiService';
import { DEFAULT_CONFIG, type AiConfig } from '../../src/shared/types/config';
import type { AiProviderId } from '../../src/shared/types/ai';

const keys = (saved: Partial<Record<AiProviderId, string>>): SavedKeys => ({ get: (p) => saved[p] });
const cfg = (over: Partial<AiConfig>): AiConfig => ({ ...DEFAULT_CONFIG.ai, ...over });
const anthropic = cfg({ provider: 'anthropic', apiKeyEnvVar: 'ANTHROPIC_API_KEY' });
const local = cfg({ provider: 'local', baseUrl: 'http://localhost:11434/v1', apiKeyEnvVar: 'LOCAL_KEY' });

describe('key resolution (SPEC-0063)', () => {
  it('each provider resolves its own saved key (AC-2)', () => {
    const saved = keys({ anthropic: 'sk-ant-A', local: 'vllm-L' });
    expect(resolveApiKey(anthropic, saved, {})).toEqual({ key: 'sk-ant-A', source: 'saved' });
    expect(resolveApiKey(local, saved, {})).toEqual({ key: 'vllm-L', source: 'saved' });
    expect(resolveApiKey(cfg({ provider: 'openai', apiKeyEnvVar: 'OPENAI_API_KEY' }), saved, {})).toEqual({ source: 'none' });
  });

  it('a legacy plain-text ai.apiKey is used only for local, never for another provider (AC-2)', () => {
    expect(resolveApiKey({ ...anthropic, apiKey: 'vllm-legacy' }, NO_SAVED_KEYS, {})).toEqual({ source: 'none' });
    expect(resolveApiKey({ ...local, apiKey: 'vllm-legacy' }, NO_SAVED_KEYS, {})).toEqual({ key: 'vllm-legacy', source: 'legacy' });
    expect(resolveApiKey({ ...local, apiKey: 'vllm-legacy' }, keys({ local: 'vllm-L' }), {})).toEqual({ key: 'vllm-L', source: 'saved' });
  });

  it('saved key wins over env, env is the fallback, none is not configured (AC-5)', () => {
    const env = { ANTHROPIC_API_KEY: 'sk-ant-ENV' };
    // saved > env
    expect(resolveApiKey(anthropic, keys({ anthropic: 'sk-ant-A' }), env)).toEqual({ key: 'sk-ant-A', source: 'saved' });
    expect(forConfig(anthropic, env, keys({ anthropic: 'sk-ant-A' }))).not.toBeNull();
    expect(isConfigured(anthropic, env, keys({ anthropic: 'sk-ant-A' }))).toBe(true);
    // env only
    expect(resolveApiKey(anthropic, NO_SAVED_KEYS, env)).toEqual({ key: 'sk-ant-ENV', source: 'env' });
    expect(forConfig(anthropic, env)).not.toBeNull();
    expect(aiAvailable(anthropic, env)).toBe(true);
    // neither
    expect(resolveApiKey(anthropic, NO_SAVED_KEYS, {})).toEqual({ source: 'none' });
    expect(forConfig(anthropic, {}, NO_SAVED_KEYS)).toBeNull();
    expect(isConfigured(anthropic, {}, NO_SAVED_KEYS)).toBe(false);
    expect(aiAvailable(anthropic, {}, NO_SAVED_KEYS)).toBe(false);
    const reason = notConfiguredReason(anthropic, {});
    expect(reason).toContain('Settings → AI');
    expect(reason).toContain('ANTHROPIC_API_KEY');
    // the storyboard check agrees with the saved key alone (it used to look at env only)
    expect(aiAvailable(anthropic, {}, keys({ anthropic: 'sk-ant-A' }))).toBe(true);
  });

  it('an invalid variable name is never used as a lookup (AC-5, AC-9)', () => {
    const misplaced = cfg({ provider: 'anthropic', apiKeyEnvVar: 'sk-ant-pasted-key' });
    expect(resolveApiKey(misplaced, NO_SAVED_KEYS, { 'sk-ant-pasted-key': 'x' })).toEqual({ source: 'none' });
    expect(isValidEnvVarName('ANTHROPIC_API_KEY')).toBe(true);
    expect(isValidEnvVarName('_x1')).toBe(true);
    expect(isValidEnvVarName('sk-ant-abc')).toBe(false);
    expect(isValidEnvVarName('1ABC')).toBe(false);
    expect(isValidEnvVarName('')).toBe(false);
  });

  it('after clear the source is env or none (AC-6)', () => {
    const saved: Partial<Record<AiProviderId, string>> = { anthropic: 'sk-ant-A' };
    const store = keys(saved);
    delete saved.anthropic; // what KeyStore.clear does
    expect(resolveApiKey(anthropic, store, { ANTHROPIC_API_KEY: 'sk-ant-ENV' }).source).toBe('env');
    expect(resolveApiKey(anthropic, store, {}).source).toBe('none');
  });

  it('the resolved key is the one the provider client sends (AC-2)', () => {
    const saved = keys({ anthropic: 'sk-ant-A', openai: 'sk-openai-O', local: 'vllm-L' });
    const env = { ANTHROPIC_API_KEY: 'sk-ant-ENV', OPENAI_API_KEY: 'sk-openai-ENV' };
    const headers = (m: unknown) => (m as { config: { headers: () => Record<string, string> } }).config.headers();
    expect(headers(forConfig(anthropic, env, saved))['x-api-key']).toBe('sk-ant-A');
    expect(headers(forConfig(cfg({ provider: 'openai', apiKeyEnvVar: 'OPENAI_API_KEY' }), env, saved)).authorization).toBe('Bearer sk-openai-O');
    expect(headers(forConfig(local, env, saved)).authorization).toBe('Bearer vllm-L');
  });

  it("a provider never reads another provider's conventional variable (review finding 1)", () => {
    const env = { ANTHROPIC_API_KEY: 'sk-ant-ENV', OPENAI_API_KEY: 'sk-openai-ENV', LOCAL_KEY: 'local-ENV' };
    // local named ANTHROPIC_API_KEY (the default name): the Anthropic key must not go to a local/remote vLLM host
    expect(resolveApiKey(cfg({ provider: 'local', baseUrl: 'http://h/v1', apiKeyEnvVar: 'ANTHROPIC_API_KEY' }), NO_SAVED_KEYS, env)).toEqual({ source: 'none' });
    expect(resolveApiKey(cfg({ provider: 'local', baseUrl: 'http://h/v1', apiKeyEnvVar: 'OPENAI_API_KEY' }), NO_SAVED_KEYS, env)).toEqual({ source: 'none' });
    expect(resolveApiKey(cfg({ provider: 'anthropic', apiKeyEnvVar: 'OPENAI_API_KEY' }), NO_SAVED_KEYS, env)).toEqual({ source: 'none' });
    expect(resolveApiKey(cfg({ provider: 'openai', apiKeyEnvVar: 'ANTHROPIC_API_KEY' }), NO_SAVED_KEYS, env)).toEqual({ source: 'none' });
    // an explicitly named, non-conventional variable still works for any provider
    expect(resolveApiKey(cfg({ provider: 'local', baseUrl: 'http://h/v1', apiKeyEnvVar: 'LOCAL_KEY' }), NO_SAVED_KEYS, env)).toEqual({ key: 'local-ENV', source: 'env' });
    // the local client then sends no real key at all
    const sent = (forConfig(cfg({ provider: 'local', baseUrl: 'http://h/v1', apiKeyEnvVar: 'ANTHROPIC_API_KEY' }), env) as unknown as { config: { headers: () => Record<string, string> } }).config.headers();
    expect(sent.authorization).toBe('Bearer local');
  });

  it("the not-configured reason says when the named variable belongs to another provider (delta review)", () => {
    const reason = notConfiguredReason(cfg({ provider: 'openai', apiKeyEnvVar: 'ANTHROPIC_API_KEY' }), { ANTHROPIC_API_KEY: 'set' });
    expect(reason).toContain('ANTHROPIC_API_KEY');
    expect(reason).toMatch(/another provider/);
    expect(reason).not.toMatch(/is not set/);
  });

  it('local still needs only a base URL; its key stays optional', () => {
    expect(forConfig(local, {}, NO_SAVED_KEYS)).not.toBeNull();
    expect(isConfigured(local, {}, NO_SAVED_KEYS)).toBe(true);
    expect(forConfig(cfg({ provider: 'local', baseUrl: undefined }), {}, NO_SAVED_KEYS)).toBeNull();
  });
});
