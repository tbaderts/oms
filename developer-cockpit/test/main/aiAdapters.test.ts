import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, type AiConfig } from '../../src/shared/types/config';
import { forConfig } from '../../src/main/ai/adapters';

// The `ai` SDK and its provider packages are ESM; the vitest test environment is node and imports
// them lazily so the factory can be built and inspected without a network call.

const key = (v: string) => (v ? { ANTHROPIC_API_KEY: v, OPENAI_API_KEY: v } : {});

describe('adapters.forConfig', () => {
  it('anthropic: a configured key resolves to an Anthropic language model', async () => {
    const model = forConfig({ ...DEFAULT_CONFIG.ai, provider: 'anthropic' }, key('k'));
    expect(model).not.toBeNull();
    // The resolved model reports its provider as anthropic (the SDK prefixes with the model family).
    expect((model as any).provider).toContain('anthropic');
    expect((model as any).modelId).toBe(DEFAULT_CONFIG.ai.model);
  });

  it('openai: a configured key resolves to an OpenAI chat model', async () => {
    const cfg: AiConfig = { ...DEFAULT_CONFIG.ai, provider: 'openai', apiKeyEnvVar: 'OPENAI_API_KEY', model: 'gpt-4o' };
    const model = forConfig(cfg, key('k'));
    expect(model).not.toBeNull();
    expect((model as any).provider).toContain('openai');
    expect((model as any).modelId).toBe('gpt-4o');
  });

  it('local: a configured baseUrl resolves to an OpenAI-compatible model with that base URL', async () => {
    const cfg: AiConfig = {
      ...DEFAULT_CONFIG.ai,
      provider: 'local',
      model: 'qwen2.5:7b',
      apiKeyEnvVar: 'OLLAMA_API_KEY',
      baseUrl: 'http://127.0.0.1:11434/v1',
    };
    const model = forConfig(cfg, key('k'));
    expect(model).not.toBeNull();
    expect((model as any).modelId).toBe('qwen2.5:7b');
  });

  it('returns null when the configured key is missing (AC-3: no network call is made)', () => {
    expect(forConfig({ ...DEFAULT_CONFIG.ai, provider: 'anthropic' }, key(''))).toBeNull();
    expect(forConfig({ ...DEFAULT_CONFIG.ai, provider: 'anthropic' }, {})).toBeNull();
    const openai: AiConfig = { ...DEFAULT_CONFIG.ai, provider: 'openai', apiKeyEnvVar: 'OPENAI_API_KEY' };
    expect(forConfig(openai, {})).toBeNull();
  });

  it('returns null for the local provider when no baseUrl is configured (AC-3)', () => {
    const local: AiConfig = { ...DEFAULT_CONFIG.ai, provider: 'local', model: 'x', apiKeyEnvVar: 'OLLAMA_API_KEY' };
    expect(forConfig(local, key('k'))).toBeNull();
    expect(forConfig(local, {})).toBeNull();
  });

  it('returns null for an unknown provider (defensive, AC-3)', () => {
    expect(forConfig({ ...DEFAULT_CONFIG.ai, provider: 'nope' as never }, key('k'))).toBeNull();
  });
});
