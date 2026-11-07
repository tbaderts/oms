import { z } from 'zod';

/**
 * Shared AI types (SPEC-0042). The renderer is sandboxed and never sees an API key: it only
 * receives these events over the cockpit WebSocket and calls the `ai.*` IPC namespace.
 */

/** A single run's identifier, minted by the renderer and echoed on every event of that run. */
export type AiRunId = string;

/** The provider/model the run used (echoed on `ai:done` for the transcript header). */
export interface AiModelInfo {
  provider: string;
  model: string;
}

/** Every AI event carries the run id so the renderer can filter to the active run. */
export interface AiEventBase {
  runId: AiRunId;
}

/** A streamed chunk of the assistant's text (reasoning or the final answer). */
export interface AiMessageEvent extends AiEventBase {
  type: 'ai:message';
  text: string;
}

/** The model asked to call a tool; `input` is the (schema-validated) parsed input. */
export interface AiToolCallEvent extends AiEventBase {
  type: 'ai:tool-call';
  toolCallId: string;
  name: string;
  input: Record<string, unknown>;
}

/** A tool finished; `output` is a bounded, JSON-safe summary of the result. */
export interface AiToolResultEvent extends AiEventBase {
  type: 'ai:tool-result';
  toolCallId: string;
  name: string;
  output: string;
}

/** Terminal success. `aborted` = the user stopped it; `incomplete` = the max-step bound was hit. */
export interface AiDoneEvent extends AiEventBase {
  type: 'ai:done';
  aborted: boolean;
  incomplete: boolean;
  model?: AiModelInfo;
  usage?: { inputTokens: number; outputTokens: number };
}

/** A non-fatal or fatal error surfaced to the UI (e.g. not configured, provider error). */
export interface AiErrorEvent extends AiEventBase {
  type: 'ai:error';
  message: string;
  /** `configuration` when the provider is not set up (AC-3); undefined for runtime/provider errors. */
  code?: 'configuration' | 'provider' | 'validation' | 'unknown';
}

export type AiEvent =
  | AiMessageEvent
  | AiToolCallEvent
  | AiToolResultEvent
  | AiDoneEvent
  | AiErrorEvent;

/** One entry appended to `~/.developer-cockpit/ai-usage.json` per completed run (AC-7). */
export interface AiUsageEntry {
  timestamp: string;
  provider: string;
  model: string;
  feature: 'assistant' | 'one-shot' | string;
  inputTokens: number;
  outputTokens: number;
}

/** The Settings usage summary (totals across all recorded entries). */
export interface AiUsageSummary {
  entries: number;
  totalInput: number;
  totalOutput: number;
}

/** `ai:available` result: whether a provider is configured, and which one. */
export interface AiStatus {
  available: boolean;
  provider: string;
  model?: string;
  /** Present (and specific) when `available` is false, e.g. which env var / URL is missing. */
  reason?: string;
}

/** Options the renderer can set for a run; bounded server-side regardless. */
export interface AiRunOptions {
  /** Max agent steps; the server clamps to [1, 20] (AC-6). */
  maxSteps?: number;
  /** Feature label recorded in usage; defaults to "assistant". */
  feature?: string;
}

export interface AiRunStartResult {
  ok: boolean;
  code?: string;
  message?: string;
  /** The run id the server will echo on the run's `ai:*` events (same as the one passed in). */
  runId?: AiRunId;
}

/*
 * Boundary schemas (AC-8). These are the shapes the main process enforces before a value crosses
 * to the renderer. Tool *inputs* are validated by the AI SDK against each tool's `inputSchema`
 * (zod) during the agent loop; `aiToolResult`/`aiStatus`/`aiUsageSummary` are validated here at the
 * boundary. `aiUsageEntry` is what gets persisted.
 */
export const aiUsageEntry = z.object({
  timestamp: z.string(),
  provider: z.string(),
  model: z.string(),
  feature: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
});

export const aiUsageSummary = z.object({
  entries: z.number().int().nonnegative(),
  totalInput: z.number().int().nonnegative(),
  totalOutput: z.number().int().nonnegative(),
});

export const aiStatus = z.object({
  available: z.boolean(),
  provider: z.string(),
  model: z.string().optional(),
  reason: z.string().optional(),
});

/** A tool result is a bounded string summary (never a raw, unvalidated object). */
export const aiToolResult = z.object({
  toolCallId: z.string(),
  name: z.string(),
  output: z.string(),
});

export const KB_SEARCH_MAX_RESULTS = 5;

/** The local knowledge-base search tool's input (the AI SDK validates it during the loop). */
export const kbSearchInput = z.object({
  query: z.string().min(1),
});

/** The local knowledge-base search tool's result (what the tool returns to the model). */
export interface KbSearchToolResult {
  query: string;
  count: number;
  results: { title: string; path: string; category: string }[];
}
