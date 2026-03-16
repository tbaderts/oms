import type { IpcMain } from 'electron';
import type { ConfigService } from '../services/ConfigService';
import { RequirementsService } from '../services/RequirementsService';

let reqService: RequirementsService | null = null;

function getReqService(configService: ConfigService): RequirementsService {
  if (!reqService) {
    reqService = new RequirementsService(configService.getKnowledgeBasePath());
  }
  return reqService;
}

export function registerRequirementsIpc(ipcMain: IpcMain, configService: ConfigService): void {
  ipcMain.handle('requirements:getUseCases', async () => {
    return getReqService(configService).getUseCases();
  });

  ipcMain.handle('requirements:getFunctionalRequirements', async () => {
    return getReqService(configService).getFunctionalRequirements();
  });

  ipcMain.handle('requirements:getNonFunctionalRequirements', async () => {
    return getReqService(configService).getNonFunctionalRequirements();
  });

  ipcMain.handle('requirements:getActors', async () => {
    return getReqService(configService).getActors();
  });
}
