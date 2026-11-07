import type { AiConfig } from '../../../shared/types/config';

export interface AiRequest {
  system: string;
  user: string;
  maxTokens: number;
}

/** One completion; storyboard assists need nothing more (no tools, no streaming). */
export interface AiAdapter {
  complete(request: AiRequest): Promise<string>;
}

/**
 * Resolves whether the configured provider can be used, based on the same rules as the
 * assistant's `forConfig` adapter factory (AC-3): a key for anthropic/openai, a base URL for local.
 */
export function isConfigured(config: AiConfig, env: NodeJS.ProcessEnv = process.env): boolean {
  switch (config.provider) {
    case 'anthropic':
    case 'openai':
      return !!env[config.apiKeyEnvVar];
    case 'local':
      return !!config.baseUrl;
    default:
      return false;
  }
}

/**
 * The single provider stack (D5): resolves the model through the shared adapter factory and
 * completes via the AI SDK. One provider call for a one-shot; no `fs` import.
 */
export class SdkAdapter implements AiAdapter {
  private model: import('ai').LanguageModel | null = null;
  private resolved = false;

  constructor(
    private readonly config: AiConfig,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  async complete({ system, user, maxTokens }: AiRequest): Promise<string> {
    if (!this.resolved) {
      const { forConfig } = await import('../../ai/adapters');
      this.model = forConfig(this.config, this.env);
      this.resolved = true;
    }
    if (!this.model) {
      throw new Error(`AI not configured: ${this.config.provider} provider is not set up.`);
    }
    const { generateText } = await import('ai');
    const result = await generateText({
      model: this.model,
      system,
      messages: [{ role: 'user', content: user }],
      maxOutputTokens: maxTokens,
      temperature: this.config.temperature,
    } as Parameters<typeof generateText>[0]);
    return result.text;
  }
}
