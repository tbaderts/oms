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

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const TIMEOUT_MS = 60_000;

/** The Anthropic Messages API through a single fetch from the main process; the key never reaches the renderer. */
export class AnthropicAdapter implements AiAdapter {
  constructor(
    private readonly config: AiConfig,
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async complete({ system, user, maxTokens }: AiRequest): Promise<string> {
    const key = this.env[this.config.apiKeyEnvVar];
    if (!key) throw new Error(`${this.config.apiKeyEnvVar} is not set`);
    const response = await this.fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: Math.min(maxTokens, this.config.maxTokens),
        temperature: this.config.temperature,
        system,
        messages: [{ role: 'user', content: user }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`AI provider returned ${response.status}: ${text.slice(0, 300)}`);
    const data = JSON.parse(text) as { content?: { type: string; text?: string }[] };
    return (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
  }
}
