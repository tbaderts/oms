import { isStepCount, streamText } from 'ai';
import type { LanguageModel } from 'ai';
import type { AiConfig } from '../../shared/types/config';
import type { AiEvent, AiModelInfo, AiRunOptions, AiStatus } from '../../shared/types/ai';
import { aiStatus } from '../../shared/types/ai';
import { forConfig } from './adapters';

/** Bounded: the renderer may pass anything, the server clamps (P-13). */
export const MAX_STEPS_MIN = 1;
export const MAX_STEPS_MAX = 20;
export const DEFAULT_MAX_STEPS = 5;
const MAX_PROMPT_CHARS = 32_000;
/** A tool result is summarized to this many characters before it is broadcast (AC-4/AC-8). */
const MAX_TOOL_OUTPUT_CHARS = 4_000;

export type Broadcast = (event: AiEvent) => void;

/** Injectable dependencies: tests pass a fake model and record broadcasts; production uses the adapters. */
export interface AiServiceDeps {
  /** The run's tool set (AC-4). Empty/absent = one-shot only. */
  tools?: Record<string, unknown>;
  /** Where the run's `ai:*` events go (the WebSocket broadcast). */
  broadcast: Broadcast;
  /** Appends one usage entry per completed run (AC-7). */
  usage?: { record: (entry: { timestamp: string; provider: string; model: string; feature: string; inputTokens: number; outputTokens: number }) => void };
  /** Test seam: a scripted model that skips provider resolution (AC-1/AC-2/AC-3). */
  model?: LanguageModel | null;
  log?: (msg: string) => void;
}

/**
 * The cockpit's AI service (D1/D5/D6): the single provider stack. `complete()` is the one-shot
 * streaming path (the storyboard assists use it after the D5 re-route); `runAgent()` is the
 * bounded multi-step tool-calling loop the AI Assistant view drives.
 *
 * Runs are keyed by `runId` (minted by the renderer); every emitted event carries it. A run never
 * throws to the caller: a not-configured provider yields an `ai:error` (AC-3), provider or
 * validation failures yield an `ai:error`, and `ai:done` is always the terminal event.
 */
export class AiService {
  private abortRegistry = new Map<string, AbortController>();

  constructor(private config: AiConfig, private env: NodeJS.ProcessEnv = process.env, private deps: AiServiceDeps = { broadcast: () => {} }) {}

  /** `ai:available`: whether the configured provider can be used, and why not (AC-3). */
  status(): AiStatus {
    const s: AiStatus = { available: false, provider: this.config.provider, model: this.config.model };
    const model = this.resolveModel();
    if (model) s.available = true;
    else s.reason = notConfiguredReason(this.config, this.env);
    const parsed = aiStatus.safeParse(s);
    return parsed.success ? parsed.data : ({ available: false, provider: this.config.provider, reason: 'provider not configured' } as AiStatus);
  }

  /** One-shot streaming completion (AC-1/AC-2/AC-3). Resolves when the run's terminal event is sent. */
  async complete(params: { prompt: string; runId: string; options?: AiRunOptions }): Promise<void> {
    const { prompt, runId } = params;
    const feature = params.options?.feature ?? 'one-shot';
    const model = this.resolveModel();
    if (!model) {
      this.deps.broadcast(this.error(runId, notConfiguredReason(this.config, this.env), 'configuration'));
      return;
    }
    const abort = new AbortController();
    this.abortRegistry.set(runId, abort);
    try {
      const result = streamText({
        model,
        system: SYSTEM,
        messages: [{ role: 'user', content: prompt.slice(0, MAX_PROMPT_CHARS) }],
        maxOutputTokens: this.config.maxTokens,
        temperature: this.config.temperature,
        abortSignal: abort.signal,
      } as Parameters<typeof streamText>[0]);
      await this.pump(result, runId, feature);
    } finally {
      this.abortRegistry.delete(runId);
    }
  }

  /**
   * The bounded multi-step tool-calling loop (AC-4/AC-5/AC-6/AC-8). The AI SDK auto-executes the
   * tools and loops; `stopWhen: isStepCount(maxSteps)` is the hard bound, and `stop(runId)` aborts.
   * `incomplete` is true when the bound was hit without a natural stop (the last step still ended
   * in tool calls).
   */
  async runAgent(params: { prompt: string; runId: string; options?: AiRunOptions }): Promise<void> {
    const { prompt, runId } = params;
    const feature = params.options?.feature ?? 'assistant';
    const maxSteps = clampSteps(params.options?.maxSteps);
    const model = this.resolveModel();
    if (!model) {
      this.deps.broadcast(this.error(runId, notConfiguredReason(this.config, this.env), 'configuration'));
      return;
    }
    const abort = new AbortController();
    this.abortRegistry.set(runId, abort);
    try {
      const result = streamText({
        model,
        system: SYSTEM,
        messages: [{ role: 'user', content: prompt.slice(0, MAX_PROMPT_CHARS) }],
        tools: (this.deps.tools ?? {}) as Record<string, never>,
        stopWhen: isStepCount(maxSteps),
        maxOutputTokens: this.config.maxTokens,
        temperature: this.config.temperature,
        abortSignal: abort.signal,
      } as Parameters<typeof streamText>[0]);
      await this.pump(result, runId, feature);
    } finally {
      this.abortRegistry.delete(runId);
    }
  }

  /** Aborts a running run; a subsequent terminal `ai:done{aborted: true}` is emitted (AC-5). */
  stop(runId: string): void {
    this.abortRegistry.get(runId)?.abort();
  }

  /** Whether a run with this id is currently running. */
  isRunning(runId: string): boolean {
    return this.abortRegistry.has(runId);
  }

  /**
   * Resolves the model. The `model` seam (tests) only *substitutes* the provider model once the
   * provider is confirmed configured; it never bypasses the not-configured gate, so AC-3 holds
   * even when a fake model is injected.
   */
  private resolveModel(): LanguageModel | null {
    const resolved = forConfig(this.config, this.env);
    if (resolved === null) return null;
    return this.deps.model ?? resolved;
  }

  /**
   * Drives the stream and translates its parts into `ai:*` events (AC-1). The terminal event is
   * always exactly one: `ai:error` on an uncaught failure, else `ai:done`. Usage is recorded once,
   * from the stream's total usage (AC-7).
   */
  private async pump(result: Awaited<ReturnType<typeof streamText>>, runId: string, feature: string): Promise<void> {
    let terminalSent = false;
    const finish = async (aborted: boolean, incomplete: boolean): Promise<void> => {
      if (terminalSent) return;
      terminalSent = true;
      let usage: { inputTokens: number; outputTokens: number } | undefined;
      try {
        const u = await result.usage;
        if (u) {
          const input = u.inputTokens ?? 0;
          const output = u.outputTokens ?? 0;
          usage = { inputTokens: input, outputTokens: output };
          this.deps.usage?.record({
            timestamp: new Date().toISOString(),
            provider: this.config.provider,
            model: this.config.model,
            feature,
            inputTokens: input,
            outputTokens: output,
          });
        }
      } catch {
        // Usage is best-effort; a missing usage never blocks the terminal event.
      }
      this.deps.broadcast(this.done(runId, aborted, incomplete, usage));
    };

    try {
      for await (const part of result.stream) {
        switch (part.type) {
          case 'text-delta':
            this.deps.broadcast({ type: 'ai:message', runId, text: part.text });
            break;
          case 'tool-call':
            this.deps.broadcast({
              type: 'ai:tool-call',
              runId,
              toolCallId: part.toolCallId,
              name: part.toolName,
              input: asRecord(part.input),
            });
            break;
          case 'tool-result':
            this.deps.broadcast({
              type: 'ai:tool-result',
              runId,
              toolCallId: part.toolCallId,
              name: part.toolName,
              output: summarize(part.output),
            });
            break;
          case 'abort':
            await finish(true, false);
            break;
          case 'finish':
            await finish(false, part.finishReason === 'tool-calls');
            break;
          default:
            break;
        }
      }
      // The stream ended without an explicit terminal part (e.g. dropped connection).
      await finish(false, false);
    } catch (err) {
      const aborted = this.abortRegistry.get(runId)?.signal.aborted ?? false;
      if (!aborted) {
        this.deps.log?.(`[ai] run ${runId} failed: ${(err as Error).message}`);
        this.deps.broadcast(this.error(runId, `AI run failed: ${(err as Error).message}`, 'provider'));
      }
      await finish(aborted, false);
    }
  }

  private done(runId: string, aborted: boolean, incomplete: boolean, usage?: { inputTokens: number; outputTokens: number }): AiEvent {
    const model: AiModelInfo | undefined = { provider: this.config.provider, model: this.config.model };
    const event: AiEvent = { type: 'ai:done', runId, aborted, incomplete, model };
    if (usage) (event as { usage?: typeof usage }).usage = usage;
    return event;
  }

  private error(runId: string, message: string, code: 'configuration' | 'provider' | 'validation' | 'unknown' = 'unknown'): AiEvent {
    const event: AiEvent = { type: 'ai:error', runId, message };
    event.code = code;
    return event;
  }
}

/** The reason a provider is not configured (AC-3); never contains a secret. */
export function notConfiguredReason(config: AiConfig, env: NodeJS.ProcessEnv = process.env): string {
  switch (config.provider) {
    case 'anthropic':
    case 'openai':
      return `AI not configured: the ${config.apiKeyEnvVar} environment variable is not set.`;
    case 'local':
      return 'AI not configured: no base URL is set for the local (OpenAI-compatible) provider.';
    default:
      return 'AI not configured: unknown provider.';
  }
}

function clampSteps(v: number | undefined): number {
  if (v === undefined || !Number.isFinite(v)) return DEFAULT_MAX_STEPS;
  return Math.min(MAX_STEPS_MAX, Math.max(MAX_STEPS_MIN, Math.floor(v)));
}

/** The tool input the model sent (a parsed object, or `{}` when absent/invalid) (AC-8). */
function asRecord(input: unknown): Record<string, unknown> {
  if (input && typeof input === 'object' && !Array.isArray(input)) return input as Record<string, unknown>;
  try {
    const parsed = JSON.parse(String(input));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // fall through
  }
  return {};
}

/** A bounded, JSON-safe string summary of a tool result (AC-4/AC-8). */
function summarize(output: unknown): string {
  let text: string;
  try {
    text = typeof output === 'string' ? output : JSON.stringify(output);
  } catch {
    text = String(output);
  }
  if (text.length > MAX_TOOL_OUTPUT_CHARS) text = `${text.slice(0, MAX_TOOL_OUTPUT_CHARS)}… (truncated)`;
  return text || '(empty result)';
}

const SYSTEM = [
  'You are the developer cockpit assistant for an order management system (OMS).',
  'Answer concisely and factually, using the tools available to you when they help.',
  'Do not invent identifiers, endpoints, or file paths that a tool did not return.',
].join(' ');
