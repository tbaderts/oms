import { isStepCount, streamText, type LanguageModel } from 'ai';
import type { AiEvent, AiStatus } from '../../shared/types.js';
import type { AiConfig } from '../config.js';
import { forConfig, notConfiguredReason } from './adapters.js';

export const MAX_STEPS_MIN = 1;
export const MAX_STEPS_MAX = 20;
export const DEFAULT_MAX_STEPS = 8;
const MAX_PROMPT_CHARS = 32_000;
/** A tool result is summarized to this many characters before it is sent to the UI. */
export const MAX_TOOL_EVENT_CHARS = 4_000;

export function clampSteps(n: number | undefined): number {
  if (n === undefined || !Number.isFinite(n)) return DEFAULT_MAX_STEPS;
  return Math.min(MAX_STEPS_MAX, Math.max(MAX_STEPS_MIN, Math.floor(n)));
}

export interface InvestigationRun {
  invId: string;
  prompt: string;
  system: string;
  tools: Record<string, unknown>;
  maxSteps?: number;
  emit: (event: AiEvent) => void;
}

/**
 * The bounded multi-step tool-calling loop (design D1), following developer-cockpit's
 * `AiService.runAgent`: `streamText` with tools and `stopWhen: isStepCount(maxSteps)`. A run never
 * throws; it always ends with exactly one `ai:done` or `ai:error`.
 */
export class InvestigationService {
  private readonly aborts = new Map<string, AbortController>();

  constructor(
    private readonly config: AiConfig,
    private readonly env: NodeJS.ProcessEnv = process.env,
    /** Test seam: replaces the provider's model once the provider counts as configured. */
    private readonly seams: { model?: LanguageModel } = {},
  ) {}

  status(): AiStatus {
    const available = forConfig(this.config, this.env) !== null;
    return available
      ? { available, provider: this.config.provider, model: this.config.model }
      : { available, provider: this.config.provider, model: this.config.model, reason: notConfiguredReason(this.config, this.env) };
  }

  stop(invId: string): boolean {
    const a = this.aborts.get(invId);
    a?.abort();
    return !!a;
  }

  async run(r: InvestigationRun): Promise<void> {
    const resolved = forConfig(this.config, this.env);
    if (!resolved) {
      r.emit({ type: 'ai:error', invId: r.invId, kind: 'configuration', message: notConfiguredReason(this.config, this.env) });
      return;
    }
    const model = this.seams.model ?? resolved;
    const abort = new AbortController();
    this.aborts.set(r.invId, abort);
    let terminal = false;
    const end = (e: AiEvent) => {
      if (terminal) return;
      terminal = true;
      r.emit(e);
    };
    try {
      const result = streamText({
        model,
        system: r.system,
        messages: [{ role: 'user', content: r.prompt.slice(0, MAX_PROMPT_CHARS) }],
        tools: r.tools as Record<string, never>,
        stopWhen: isStepCount(clampSteps(r.maxSteps)),
        maxOutputTokens: this.config.maxTokens,
        abortSignal: abort.signal,
      } as Parameters<typeof streamText>[0]);
      for await (const part of result.stream) {
        switch (part.type) {
          case 'text-delta':
            r.emit({ type: 'ai:message', invId: r.invId, text: part.text });
            break;
          case 'tool-call':
            r.emit({ type: 'ai:tool-call', invId: r.invId, toolCallId: part.toolCallId, name: part.toolName, input: asRecord(part.input) });
            break;
          case 'tool-result':
            r.emit({ type: 'ai:tool-result', invId: r.invId, toolCallId: part.toolCallId, name: part.toolName, output: summarize(part.output) });
            break;
          case 'tool-error':
            r.emit({ type: 'ai:tool-result', invId: r.invId, toolCallId: part.toolCallId, name: part.toolName, output: summarize({ error: String((part as { error?: unknown }).error) }) });
            break;
          case 'abort':
            end({ type: 'ai:done', invId: r.invId, aborted: true, incomplete: false });
            break;
          case 'finish':
            end({ type: 'ai:done', invId: r.invId, aborted: false, incomplete: part.finishReason === 'tool-calls' });
            break;
          case 'error':
            end({ type: 'ai:error', invId: r.invId, kind: 'provider', message: String((part as { error?: unknown }).error) });
            break;
          default:
            break;
        }
      }
      end({ type: 'ai:done', invId: r.invId, aborted: abort.signal.aborted, incomplete: false });
    } catch (e) {
      end(abort.signal.aborted ? { type: 'ai:done', invId: r.invId, aborted: true, incomplete: false } : { type: 'ai:error', invId: r.invId, kind: 'provider', message: (e as Error).message });
    } finally {
      this.aborts.delete(r.invId);
    }
  }
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : { value: v };
}

function summarize(v: unknown): string {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > MAX_TOOL_EVENT_CHARS ? s.slice(0, MAX_TOOL_EVENT_CHARS - 1) + '…' : s;
}
