import type { IpcMain } from 'electron';
import type { ConfigService } from '../services/ConfigService';
import type { KbService } from '../services/KbService';
import { AiUsageTracker } from '../ai/AiUsageTracker';
import { AiService, notConfiguredReason } from '../ai/AiService';
import { McpToolRegistry, type McpTools } from '../ai/McpToolRegistry';
import type { AiEvent, AiStatus } from '../../shared/types/ai';
import type { CockpitEvent } from '../../shared/types/events';
import type { AiConfig } from '../../shared/types/config';

/** Electron-only pieces, injected so this module (and its tests) never import electron or the real env. */
export interface AiIpcDeps {
  configService: ConfigService;
  /** Lazily resolves the KB service, so a config change can swap in a new path between runs. */
  kb: () => Pick<KbService, 'search'>;
  usage: AiUsageTracker;
  /** Delivers the run's `ai:*` events to the connected renderer (the WebSocket broadcast). */
  broadcast: (event: CockpitEvent<AiEvent>) => void;
  env?: NodeJS.ProcessEnv;
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
  const runtime: Runtime = { tools: null, services: new Map(), toolsConfigKey: null };

  /** The model seam: tests inject a scripted model; production resolves through the adapter factory. */
  const makeService = (config: AiConfig, tools: McpTools | null): AiService =>
    new AiService(config, env, {
      broadcast: (event) => deps.broadcast({ type: event.type, timestamp: Date.now(), payload: event } as CockpitEvent<AiEvent>),
      usage: deps.usage,
      tools: tools?.tools,
      log: console.warn,
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

  ipcMain.handle('ai:stop', (_e, runId: unknown) => {
    // A stop is idempotent: an unknown runId is a no-op, never an error.
    runtime.services.get(typeof runId === 'string' ? runId : '')?.stop(runId as string);
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
    },
  };
}
