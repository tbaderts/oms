import type { IpcMain } from 'electron';
import type { ConfigService } from '../services/ConfigService';
import type { CockpitConfig } from '../../shared/types/config';

/** `onSaved` lets main react to settings changes, e.g. watching new template files. */
export function registerConfigIpc(ipcMain: IpcMain, configService: ConfigService, onSaved?: (config: CockpitConfig) => void): void {
  ipcMain.handle('config:load', async () => {
    return configService.getConfig();
  });

  ipcMain.handle('config:save', async (_event, config) => {
    await configService.save(config);
    onSaved?.(config);
  });

  ipcMain.handle('config:getWorkspaceRoot', async () => {
    return configService.getWorkspaceRoot();
  });
}
