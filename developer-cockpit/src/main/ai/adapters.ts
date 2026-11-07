import type { AiConfig } from '../../shared/types/config';
import type { LanguageModel } from 'ai';
// The provider packages are ESM; import them lazily so a not-configured provider never pulls the
// network-facing factory into the hot path and so `forConfig` can return `null` cleanly (AC-3).

/**
 * Maps the configured provider to an AI-SDK language model, or `null` when it is not configured.
 *
 * This is the single provider-resolution seam (D5/D6): every AI feature (the assistant's one-shot
 * `complete()` and the agent loop, and — after the D5 re-route — the storyboard assists) resolves
 * its model through here, so there is one provider stack. A `null` return means "not configured"
 * and the caller surfaces an `ai:error` configuration message without touching the network (AC-3).
 */
export function forConfig(config: AiConfig, env: NodeJS.ProcessEnv = process.env): LanguageModel | null {
  // An explicit `apiKey` in the config takes precedence over the env-var lookup, so a local
  // vLLM server with a non-standard key can be configured without exporting an env var.
  const apiKey = config.apiKey || env[config.apiKeyEnvVar];

  switch (config.provider) {
    case 'anthropic': {
      if (!apiKey) return null;
      const { createAnthropic } = require('@ai-sdk/anthropic') as typeof import('@ai-sdk/anthropic');
      return createAnthropic({ apiKey }).languageModel(config.model);
    }
    case 'openai': {
      if (!apiKey) return null;
      const { createOpenAI } = require('@ai-sdk/openai') as typeof import('@ai-sdk/openai');
      return createOpenAI({ apiKey }).languageModel(config.model);
    }
    case 'local': {
      // The `local` provider is any OpenAI-compatible endpoint (Ollama, vLLM, …). It has no API
      // key requirement: a missing baseUrl is the configuration error, not a missing key (AC-3).
      if (!config.baseUrl) return null;
      const { createOpenAICompatible } = require('@ai-sdk/openai-compatible') as typeof import('@ai-sdk/openai-compatible');
      return createOpenAICompatible({ name: 'local', baseURL: config.baseUrl, apiKey: apiKey || 'local' }).languageModel(config.model);
    }
    default:
      return null;
  }
}
