import type { IpcMain } from 'electron';
import * as path from 'path';
import type { ConfigService } from '../services/ConfigService';
import { resolveStoryboardsConfig } from '../services/ConfigService';
import type { CockpitConfig } from '../../shared/types/config';
import type { CockpitEvent } from '../../shared/types/events';
import { EDITABLE_ASSET_NAME } from '../../shared/storyboards/ids';
import type { AiAssistKind, StoryboardResult } from '../../shared/types/storyboards';
import { StoryboardService } from '../storyboards/StoryboardService';
import { LinkIndexService } from '../storyboards/LinkIndexService';
import { EvidenceService } from '../storyboards/EvidenceService';
import { StoryboardExportService } from '../storyboards/StoryboardExportService';
import { StoryboardAiService, aiAvailable } from '../storyboards/StoryboardAiService';
import { AnthropicAdapter } from '../storyboards/ai/AiAdapter';
import { resolveAsset } from '../storyboards/assets';
import { kbExtractReader } from '../storyboards/kbExtracts';

/** Electron-only capabilities, injected so that this module (and its tests) never import electron. */
export interface StoryboardsIpcDeps {
  configService: ConfigService;
  broadcast?: (event: CockpitEvent) => void;
  /** Shows a save dialog; null when the user cancels. */
  chooseSaveFile: (defaultName: string, extension: 'mmd' | 'html' | 'pdf') => Promise<string | null>;
  writeFile: (file: string, content: string | Buffer) => void;
  /** Renders standalone HTML to PDF (a hidden, script-less window). */
  printToPdf: (html: string) => Promise<Buffer>;
  env?: NodeJS.ProcessEnv;
}

export interface StoryboardsIpc {
  /** The current service, built on first use from the configuration. */
  service(): StoryboardService;
  onWatcherPath(filePath: string, kind: string): void;
  reconfigure(config: CockpitConfig): void;
  dispose(): void;
}

interface Runtime {
  key: string;
  service: StoryboardService;
  linkIndex: LinkIndexService;
  exporter: StoryboardExportService;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * IPC for the Storyboards view. Every channel takes ids and values, never a filesystem path; the
 * service validates everything again, so a compromised renderer cannot reach outside the roots.
 */
export function registerStoryboardsIpc(ipcMain: IpcMain, deps: StoryboardsIpcDeps): StoryboardsIpc {
  const env = deps.env ?? process.env;
  let runtime: Runtime | null = null;

  const build = (config: CockpitConfig): Runtime => {
    const workspaceRoot = config.general.workspaceRoot;
    const kbPath = path.isAbsolute(config.knowledgeBase.rootPath) ? config.knowledgeBase.rootPath : path.join(workspaceRoot, config.knowledgeBase.rootPath);
    const linkIndex = new LinkIndexService({ workspaceRoot, kbPath, openApiPaths: config.specs.openApiPaths, avroPaths: config.specs.avroPaths });
    const evidence = new EvidenceService({ workspaceRoot, kbPath, log: console });
    const service = new StoryboardService({
      workspaceRoot,
      kbPath,
      config: resolveStoryboardsConfig(config.storyboards, env),
      linkIndex,
      evaluateCard: evidence.evaluator(),
      broadcast: deps.broadcast,
      log: console,
    });
    return { key: runtimeKey(config), service, linkIndex, exporter: new StoryboardExportService(service) };
  };
  const rt = (): Runtime => (runtime ??= build(deps.configService.getConfig()));

  const ai = () => {
    const config = deps.configService.getConfig();
    if (!aiAvailable(config.ai, env)) return null;
    return new StoryboardAiService({
      adapter: new AnthropicAdapter(config.ai, env),
      storyboards: rt().service,
      linkIndex: rt().linkIndex,
      extract: kbExtractReader(deps.configService.getKnowledgeBasePath()),
    });
  };

  const saveTo = async (id: string, extension: 'mmd' | 'html' | 'pdf', content: string | Buffer): Promise<string | null> => {
    const file = await deps.chooseSaveFile(`${id}.${extension}`, extension);
    if (!file) return null;
    deps.writeFile(file, content);
    console.info(`[storyboards] exported ${id} to ${file}`);
    return file;
  };

  /**
   * Channels that answer with a StoryboardResult: a file-system error (EPERM from a virus scanner,
   * a vanished folder) becomes { ok: false } instead of a rejected IPC call.
   */
  const handle = (channel: string, fn: (...args: any[]) => unknown) =>
    ipcMain.handle(channel, async (_e, ...args) => {
      try {
        return await fn(...args);
      } catch (err) {
        console.error(`[storyboards] ${channel} failed:`, err);
        return { ok: false, code: 'invalid', message: `The operation failed: ${(err as Error).message}` } satisfies StoryboardResult;
      }
    });

  ipcMain.handle('storyboards:scan', async () => rt().service.scan());
  handle('storyboards:detail', async (id) => rt().service.detail(str(id)));
  handle('storyboards:create', async (input) => rt().service.create(input));
  handle('storyboards:saveStory', async (id, patch, body, revision) => rt().service.saveStory(str(id), patch, body, revision));
  handle('storyboards:createStep', async (id, title, afterStepId, revision) => rt().service.createStep(str(id), title, afterStepId, revision));
  handle('storyboards:saveStep', async (id, stepId, patch, body, revision) => rt().service.saveStep(str(id), stepId, patch, body, revision));
  handle('storyboards:deleteStep', async (id, stepId, deleteAssets, revision) => rt().service.deleteStep(str(id), stepId, deleteAssets, revision));
  handle('storyboards:reorder', async (id, stepIds, revision) => rt().service.reorder(str(id), stepIds, revision));
  handle('storyboards:saveIllustration', async (id, name, svg) => rt().service.saveIllustration(str(id), name, svg));
  handle('storyboards:library', async (id) => rt().service.library(str(id)));
  handle('storyboards:readIllustration', async (id, name): Promise<StoryboardResult<{ svg: string }>> => {
    if (typeof name !== 'string' || !EDITABLE_ASSET_NAME.test(name)) return { ok: false, code: 'invalid', message: 'Only *.excalidraw.svg files can be opened in the editor.' };
    const asset = resolveAsset(rt().service, str(id), name);
    if (asset.status !== 200 || !asset.body) return { ok: false, code: asset.status === 413 ? 'too-large' : 'not-found', message: `Illustration ${name} cannot be read.` };
    return { ok: true, svg: asset.body.toString('utf8') };
  });
  ipcMain.handle('storyboards:links', async () => rt().linkIndex.get());
  ipcMain.handle('storyboards:backlinks', async (_e, target) => rt().service.backlinks(str(target)));

  handle('storyboards:exportMermaid', async (id, extensions, save) => {
    const r = rt().exporter.mermaid(str(id), extensions === true);
    if (!r.ok || save !== true) return r;
    return { ...r, savedTo: (await saveTo(str(id), 'mmd', r.source)) ?? undefined };
  });
  handle('storyboards:exportHtml', async (id, sequenceSvg, save) => {
    const r = await rt().exporter.html(str(id), typeof sequenceSvg === 'string' ? sequenceSvg : undefined);
    if (!r.ok || save !== true) return r;
    return { ...r, savedTo: (await saveTo(str(id), 'html', r.html)) ?? undefined };
  });
  handle('storyboards:exportPdf', async (id, sequenceSvg) => {
    const r = await rt().exporter.html(str(id), typeof sequenceSvg === 'string' ? sequenceSvg : undefined);
    if (!r.ok) return r;
    const file = await deps.chooseSaveFile(`${str(id)}.pdf`, 'pdf');
    if (!file) return { ok: true, savedTo: null };
    deps.writeFile(file, await deps.printToPdf(r.html));
    console.info(`[storyboards] exported ${str(id)} to ${file}`);
    return { ok: true, savedTo: file };
  });

  ipcMain.handle('storyboards:aiAvailable', async () => ai() !== null);
  handle('storyboards:aiAssist', async (kind, id, stepId) => {
    const assistant = ai();
    if (!assistant) return { ok: false, code: 'invalid', message: 'AI assists need a configured provider and its API key.' };
    return assistant.assist(kind as AiAssistKind, str(id), str(stepId));
  });

  return {
    service: () => rt().service,
    onWatcherPath(filePath, kind) {
      if (!runtime) return;
      if (runtime.linkIndex.isSource(filePath)) runtime.linkIndex.invalidate();
      runtime.service.onWatcherPath(filePath, kind);
    },
    reconfigure(config) {
      if (runtime && runtime.key === runtimeKey(config)) {
        runtime.linkIndex.invalidate();
        runtime.service.reconfigure(resolveStoryboardsConfig(config.storyboards, env));
        return;
      }
      runtime?.service.dispose();
      runtime = build(config);
      runtime.service.reconfigure(resolveStoryboardsConfig(config.storyboards, env));
    },
    dispose() {
      runtime?.service.dispose();
      runtime = null;
    },
  };
}

/** What forces a rebuild: a different workspace, knowledge base or contract folders. */
function runtimeKey(config: CockpitConfig): string {
  return JSON.stringify([config.general.workspaceRoot, config.knowledgeBase.rootPath, config.specs.openApiPaths, config.specs.avroPaths]);
}
