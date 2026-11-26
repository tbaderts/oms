import type { IpcMain } from 'electron';
import type { ConfigService } from '../services/ConfigService';
import { KbService } from '../services/KbService';
import { OkfCli } from '../services/OkfCli';

let kbService: KbService | null = null;

async function getKbService(configService: ConfigService): Promise<KbService> {
  if (!kbService) {
    kbService = new KbService(configService.getKnowledgeBasePath());
    await kbService.scan();
  }
  return kbService;
}

export interface KbIpcDeps {
  /** The checker runner for a workspace root (SPEC-0064); replaced in tests. */
  createOkfCli?: (workspaceRoot: string) => OkfCli;
}

export function registerKbIpc(ipcMain: IpcMain, configService: ConfigService, deps: KbIpcDeps = {}): void {
  kbService = null;
  const okfCli = () =>
    (deps.createOkfCli ?? ((root: string) => new OkfCli(root, process.execPath, configService.getProject().config.knowledgeBase.checkScript)))(
      configService.getWorkspaceRoot(),
    );

  ipcMain.handle('kb:getCategories', async () => {
    const svc = await getKbService(configService);
    return svc.getCategories();
  });

  ipcMain.handle('kb:getDocuments', async (_event, category: string) => {
    const svc = await getKbService(configService);
    return svc.getDocuments(category);
  });

  ipcMain.handle('kb:getTypeGroups', async () => {
    const svc = await getKbService(configService);
    return svc.getTypeGroups();
  });

  ipcMain.handle('kb:getDocument', async (_event, path: string) => {
    const svc = await getKbService(configService);
    return svc.getDocument(path);
  });

  ipcMain.handle('kb:search', async (_event, query: string) => {
    const svc = await getKbService(configService);
    return svc.search(query);
  });

  // SPEC-0064: the knowledge base checker's report, and its index fix.
  ipcMain.handle('kb:health', async () => {
    const report = await okfCli().report(configService.getKnowledgeBasePath());
    // The checker reads the disk fresh; rescan so every finding's document can be opened.
    if (kbService) await kbService.scan();
    return report;
  });

  ipcMain.handle('kb:fixIndexes', async (_event, apply: unknown) => {
    const result = await okfCli().fixIndexes(configService.getKnowledgeBasePath(), apply === true);
    if (result.applied) {
      // Created or extended index files must show in the explorer.
      const svc = await getKbService(configService);
      await svc.scan();
    }
    return result;
  });
}
