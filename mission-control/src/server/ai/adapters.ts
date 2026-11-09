import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import type { AiConfig } from '../config.js';

/**
 * Maps the configured provider to an AI SDK model, or null when it is not configured — the same
 * seam as developer-cockpit's `forConfig` (design D1). Keys come only from the environment.
 */
export function forConfig(config: AiConfig, env: NodeJS.ProcessEnv = process.env): LanguageModel | null {
  switch (config.provider) {
    case 'anthropic':
      return env.ANTHROPIC_API_KEY ? createAnthropic({ apiKey: env.ANTHROPIC_API_KEY }).languageModel(config.model) : null;
    case 'openai':
      return env.OPENAI_API_KEY ? createOpenAI({ apiKey: env.OPENAI_API_KEY }).languageModel(config.model) : null;
    case 'local':
      return config.baseUrl
        ? createOpenAICompatible({ name: 'local', baseURL: config.baseUrl, apiKey: env.OPENAI_API_KEY || 'local' }).languageModel(config.model)
        : null;
    default:
      return null;
  }
}

export function notConfiguredReason(config: AiConfig, env: NodeJS.ProcessEnv = process.env): string {
  switch (config.provider) {
    case 'anthropic':
      return env.ANTHROPIC_API_KEY ? '' : 'Set ANTHROPIC_API_KEY to enable AI investigation (MC_AI_PROVIDER=anthropic).';
    case 'openai':
      return env.OPENAI_API_KEY ? '' : 'Set OPENAI_API_KEY to enable AI investigation (MC_AI_PROVIDER=openai).';
    case 'local':
      return config.baseUrl ? '' : 'Set MC_AI_BASE_URL to an OpenAI-compatible endpoint (MC_AI_PROVIDER=local).';
    default:
      return 'AI investigation is switched off (MC_AI_PROVIDER=none).';
  }
}
