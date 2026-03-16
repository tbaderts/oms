import type { IpcMain } from 'electron';
import type { ConfigService } from '../services/ConfigService';

export function registerConfigIpc(ipcMain: IpcMain, configService: ConfigService): void {
  ipcMain.handle('config:load', async () => {
    return configService.getConfig();
  });

  ipcMain.handle('config:save', async (_event, config) => {
    await configService.save(config);
  });

  ipcMain.handle('config:getWorkspaceRoot', async () => {
    return configService.getWorkspaceRoot();
  });
}
