import type { IpcMain } from 'electron';
import type { ConfigService } from '../services/ConfigService';
import { KbService } from '../services/KbService';

let kbService: KbService | null = null;

async function getKbService(configService: ConfigService): Promise<KbService> {
  if (!kbService) {
    kbService = new KbService(configService.getKnowledgeBasePath());
    await kbService.scan();
  }
  return kbService;
}

export function registerKbIpc(ipcMain: IpcMain, configService: ConfigService): void {
  ipcMain.handle('kb:getCategories', async () => {
    const svc = await getKbService(configService);
    return svc.getCategories();
  });

  ipcMain.handle('kb:getDocuments', async (_event, category: string) => {
    const svc = await getKbService(configService);
    return svc.getDocuments(category);
  });

  ipcMain.handle('kb:getDocument', async (_event, path: string) => {
    const svc = await getKbService(configService);
    return svc.getDocument(path);
  });

  ipcMain.handle('kb:search', async (_event, query: string) => {
    const svc = await getKbService(configService);
    return svc.search(query);
  });
}
