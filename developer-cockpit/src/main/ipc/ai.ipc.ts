import type { IpcMain } from 'electron';
import type { ConfigService } from '../services/ConfigService';
import type { KbService } from '../services/KbService';
import { AiUsageTracker } from '../ai/AiUsageTracker';
import { AiService, notConfiguredReason } from '../ai/AiService';
import { McpToolRegistry, type McpTools } from '../ai/McpToolRegistry';
import { KbChatTools, type KbChatToolSet } from '../ai/KbChatTools';
import type { LanguageModel } from 'ai';
import { KB_CHAT_MAX_MESSAGES, type AiEvent, type AiStatus, type KbChatMessage, type KbChatStartResult } from '../../shared/types/ai';
import type { CockpitEvent } from '../../shared/types/events';
import { DEFAULT_KNOWLEDGE_SERVER_URL, type AiConfig } from '../../shared/types/config';

/** Electron-only pieces, injected so this module (and its tests) never import electron or the real env. */
export interface AiIpcDeps {
  configService: ConfigService;
  /** Lazily resolves the KB service, so a config change can swap in a new path between runs. */
  kb: () => Pick<KbService, 'search' | 'getDocument'>;
  usage: AiUsageTracker;
  /** Delivers the run's `ai:*` events to the connected renderer (the WebSocket broadcast). */
  broadcast: (event: CockpitEvent<AiEvent>) => void;
  env?: NodeJS.ProcessEnv;
  /** Test seam: a scripted model used once the provider is confirmed configured. Production leaves it unset. */
  model?: LanguageModel;
}

/** A local (fallback) KB chat tool set is retried against the knowledge server after this long (D6). */
export const KB_CHAT_RETRY_MS = 60_000;

/** Why a KB chat conversation is not acceptable, or null when it is (P-13, P-16). */
export function validateKbChatMessages(messages: unknown): string | null {
  if (!Array.isArray(messages) || messages.length === 0) return 'messages must be a non-empty array.';
  if (messages.length > KB_CHAT_MAX_MESSAGES) return `messages must hold at most ${KB_CHAT_MAX_MESSAGES} entries.`;
  for (const m of messages) {
    const msg = m as { role?: unknown; content?: unknown } | null;
    if (!msg || (msg.role !== 'user' && msg.role !== 'assistant')) return 'each message role must be "user" or "assistant".';
    if (typeof msg.content !== 'string' || !msg.content.trim()) return 'each message content must be a non-empty string.';
    if (msg.content.length > MAX_RUN_PROMPT) return `each message must be at most ${MAX_RUN_PROMPT} characters.`;
  }
  if ((messages[messages.length - 1] as { role: string }).role !== 'user') return 'the last message must be the user\'s question.';
  return null;
}

export interface AiIpc {
  dispose(): void;
}

/** The prompt must be a non-empty string; the server bounds it anyway (P-13). */
const MAX_RUN_PROMPT = 32_000;

interface Runtime {
  /** The tool set for a run (KB search + configured MCP tools), built once per register. */
  tools: McpTools | null;
  /** The in-flight service, keyed by runId so ai:stop can abort it. */
  services: Map<string, AiService>;
  /** The config the current tools were built from (a config change rebuilds them). */
  toolsConfigKey: string | null;
  /** The KB chat's tool set, the URL it was built for and when (SPEC-0062). */
  kbChat?: { url: string; set: KbChatToolSet; builtAt: number };
  /** KB chat runs whose tools are still being built (not yet in `services`). */
  starting: Set<string>;
  /** Runs stopped while starting: they end with `ai:done{aborted}` and never call the model. */
  stoppedWhileStarting: Set<string>;
}

function configKey(config: AiConfig): string {
  const mcp = (config.mcpServers ?? []).map((s) => `${s.name}:${s.url}`).join('|');
  return `${config.provider}:${config.model}:${config.apiKeyEnvVar}:${config.baseUrl ?? ''}:${mcp}`;
}

/**
 * IPC for the AI Assistant (SPEC-0042). Every channel answers with a value, never a rejected
 * promise: a bad argument is `{ ok: false, code, message }`, mirroring `storyboards.ipc.ts`. The
 * API key lives only in the main process (P-16): the renderer gets an availability boolean and the
 * streamed results.
 */
export function registerAiIpc(ipcMain: IpcMain, deps: AiIpcDeps): AiIpc {
  const env = deps.env ?? process.env;
  const runtime: Runtime = { tools: null, services: new Map(), toolsConfigKey: null, starting: new Set(), stoppedWhileStarting: new Set() };

  /** The model seam: tests inject a scripted model; production resolves through the adapter factory. */
  const makeService = (config: AiConfig, tools: McpTools | null): AiService =>
    new AiService(config, env, {
      broadcast: (event) => deps.broadcast({ type: event.type, timestamp: Date.now(), payload: event } as CockpitEvent<AiEvent>),
      usage: deps.usage,
      tools: tools?.tools,
      log: console.warn,
      ...(deps.model ? { model: deps.model } : {}),
    });

  /**
   * Tools are (re)built for the current config. A failed MCP server is skipped inside the registry;
   * a registry failure degrades to the KB-only tool set (the local tool never depends on MCP, D2).
   */
  const toolsFor = async (config: AiConfig): Promise<McpTools> => {
    const key = configKey(config);
    if (runtime.tools && runtime.toolsConfigKey === key) return runtime.tools;
    await runtime.tools?.close().catch(() => {});
    let built: McpTools;
    try {
      built = await McpToolRegistry.build(deps.kb(), config.mcpServers ?? [], console.warn);
    } catch (err) {
      // MCP is the extension point; the KB tool alone keeps the assistant usable.
      console.warn(`[ai] tool registry failed, using KB search only: ${(err as Error).message}`);
      built = await McpToolRegistry.build(deps.kb(), [], console.warn);
    }
    runtime.tools = built;
    runtime.toolsConfigKey = key;
    return built;
  };

  ipcMain.handle('ai:available', async (): Promise<AiStatus> => {
    const config = deps.configService.getConfig().ai;
    const service = makeService(config, runtime.tools);
    const status = service.status();
    if (!status.available && !status.reason) status.reason = notConfiguredReason(config, env);
    return status;
  });

  ipcMain.handle('ai:run', async (_e, runId: unknown, prompt: unknown, options?: unknown) => {
    if (typeof runId !== 'string' || !runId) return { ok: false, code: 'invalid', message: 'runId must be a non-empty string.' };
    if (typeof prompt !== 'string' || !prompt.trim()) return { ok: false, code: 'invalid', message: 'prompt must be a non-empty string.' };
    if (prompt.length > MAX_RUN_PROMPT) return { ok: false, code: 'invalid', message: `prompt must be at most ${MAX_RUN_PROMPT} characters.` };
    const opts = (options && typeof options === 'object' ? options : {}) as { maxSteps?: number; feature?: string };
    try {
      const config = deps.configService.getConfig().ai;
      const tools = await toolsFor(config);
      const service = makeService(config, tools);
      if (runtime.services.has(runId)) {
        return { ok: false, code: 'invalid', message: `A run with id "${runId}" is already in progress.` };
      }
      runtime.services.set(runId, service);
      // The run is fire-and-forget: events flow over the WebSocket, the IPC answers immediately.
      void service
        .runAgent({ prompt, runId, options: opts })
        .catch((err) => {
          deps.broadcast({ type: 'ai:error', timestamp: Date.now(), payload: { type: 'ai:error', runId, message: `AI run failed: ${(err as Error).message}`, code: 'provider' } });
        })
        .finally(() => runtime.services.delete(runId));
      return { ok: true, runId };
    } catch (err) {
      return { ok: false, code: 'invalid', message: `Could not start the run: ${(err as Error).message}` };
    }
  });

  /**
   * The KB chat's tool set (SPEC-0062): the knowledge server's KB tools when reachable, else the
   * local fallback. A knowledge-server set is kept until the URL changes; a local set is rebuilt at
   * most every KB_CHAT_RETRY_MS, so a server that comes back is picked up without a connect delay
   * on every question while it is down (design D6).
   */
  const kbChatToolsFor = async (config: AiConfig): Promise<KbChatToolSet> => {
    const url = config.knowledgeServerUrl ?? DEFAULT_KNOWLEDGE_SERVER_URL;
    const cached = runtime.kbChat;
    if (cached && cached.url === url && (cached.set.source === 'knowledge-server' || Date.now() - cached.builtAt < KB_CHAT_RETRY_MS)) {
      return cached.set;
    }
    await cached?.set.close().catch(() => {});
    const set = await KbChatTools.build(url, deps.kb(), console.warn);
    runtime.kbChat = { url, set, builtAt: Date.now() };
    return set;
  };

  ipcMain.handle('ai:kbChat', async (_e, runId: unknown, messages: unknown, options?: unknown): Promise<KbChatStartResult> => {
    if (typeof runId !== 'string' || !runId) return { ok: false, code: 'invalid', message: 'runId must be a non-empty string.' };
    const invalid = validateKbChatMessages(messages);
    if (invalid) return { ok: false, code: 'invalid', message: invalid };
    if (runtime.services.has(runId) || runtime.starting.has(runId)) {
      return { ok: false, code: 'invalid', message: `A run with id "${runId}" is already in progress.` };
    }
    const opts = (options && typeof options === 'object' ? options : {}) as { maxSteps?: number };
    // Building the tools can take up to the MCP connect timeout; a stop in that window is
    // remembered and honoured before the model is called (review finding, AC-8).
    runtime.starting.add(runId);
    try {
      const config = deps.configService.getConfig().ai;
      let toolSet: KbChatToolSet;
      try {
        toolSet = await kbChatToolsFor(config);
      } finally {
        runtime.starting.delete(runId);
      }
      if (runtime.stoppedWhileStarting.delete(runId)) {
        deps.broadcast({ type: 'ai:done', timestamp: Date.now(), payload: { type: 'ai:done', runId, aborted: true, incomplete: false } });
        return { ok: true, runId, source: toolSet.source };
      }
      const service = makeService(config, { tools: toolSet.tools, close: async () => {} });
      runtime.services.set(runId, service);
      void service
        .runChat({ runId, messages: messages as KbChatMessage[], options: { maxSteps: opts.maxSteps, feature: 'kb-chat' } })
        .catch((err) => {
          deps.broadcast({ type: 'ai:error', timestamp: Date.now(), payload: { type: 'ai:error', runId, message: `AI run failed: ${(err as Error).message}`, code: 'provider' } });
        })
        .finally(() => runtime.services.delete(runId));
      return { ok: true, runId, source: toolSet.source };
    } catch (err) {
      return { ok: false, code: 'invalid', message: `Could not start the run: ${(err as Error).message}` };
    }
  });

  ipcMain.handle('ai:stop', (_e, runId: unknown) => {
    // A stop is idempotent: an unknown runId is a no-op, never an error.
    const id = typeof runId === 'string' ? runId : '';
    if (runtime.starting.has(id)) runtime.stoppedWhileStarting.add(id);
    runtime.services.get(id)?.stop(id);
    return undefined;
  });

  ipcMain.handle('ai:usage', () => {
    return deps.usage.summary();
  });

  return {
    dispose(): void {
      for (const id of runtime.services.keys()) runtime.services.get(id)?.stop(id);
      runtime.services.clear();
      void runtime.tools?.close().catch(() => {});
      runtime.tools = null;
      void runtime.kbChat?.set.close().catch(() => {});
      runtime.kbChat = undefined;
    },
  };
}
