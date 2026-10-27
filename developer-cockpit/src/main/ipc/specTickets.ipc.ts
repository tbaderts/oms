import type { IpcMain } from 'electron';
import type { ConfigService } from '../services/ConfigService';
import { SpecTicketsService } from '../services/SpecTicketsService';
import type { SpecAction, SpecDocument } from '../../shared/types/specTickets';

let specTicketsService: SpecTicketsService | null = null;

function getSpecTicketsService(configService: ConfigService): SpecTicketsService {
  if (!specTicketsService) {
    specTicketsService = new SpecTicketsService(configService.getWorkspaceRoot());
  }
  return specTicketsService;
}

// Workflow actions are reachable only through these renderer IPC channels, never over the
// WebSocket event server (which is outbound-only).
export function registerSpecTicketsIpc(ipcMain: IpcMain, configService: ConfigService): void {
  ipcMain.handle('specTickets:list', async (_event, includeArchived: boolean) => {
    return getSpecTicketsService(configService).listTickets(Boolean(includeArchived));
  });

  ipcMain.handle('specTickets:get', async (_event, id: string) => {
    return getSpecTicketsService(configService).getTicket(id);
  });

  ipcMain.handle('specTickets:run', async (_event, action: SpecAction) => {
    return getSpecTicketsService(configService).runAction(action);
  });

  ipcMain.handle(
    'specTickets:saveDocument',
    async (_event, id: string, doc: SpecDocument, content: string, baseContent: string, force: boolean) => {
      return getSpecTicketsService(configService).saveDocument(id, doc, content, baseContent, Boolean(force));
    },
  );

  ipcMain.handle('specTickets:draftGate', async (_event, id: string, doc: SpecDocument, content: string) => {
    return getSpecTicketsService(configService).draftGate(id, doc, content);
  });

  ipcMain.handle(
    'specTickets:toggleTask',
    async (_event, id: string, taskId: string, done: boolean, baseContent: string, force: boolean) => {
      return getSpecTicketsService(configService).toggleTask(id, taskId, Boolean(done), baseContent, Boolean(force));
    },
  );
}
