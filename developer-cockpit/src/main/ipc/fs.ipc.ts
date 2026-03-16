import type { IpcMain } from 'electron';
import type { ConfigService } from '../services/ConfigService';
import { FsService } from '../services/FsService';

let fsService: FsService | null = null;

function getFsService(configService: ConfigService): FsService {
  if (!fsService) {
    fsService = new FsService(configService.getWorkspaceRoot());
  }
  return fsService;
}

export function registerFsIpc(ipcMain: IpcMain, configService: ConfigService): void {
  ipcMain.handle('fs:readDir', async (_event, path: string) => {
    return getFsService(configService).readDir(path);
  });

  ipcMain.handle('fs:readFile', async (_event, path: string) => {
    return getFsService(configService).readFile(path);
  });

  ipcMain.handle('fs:stat', async (_event, path: string) => {
    return getFsService(configService).stat(path);
  });
}
