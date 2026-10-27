import type { IpcMain } from 'electron';
import type { ConfigService } from '../services/ConfigService';
import type { CockpitConfig } from '../../shared/types/config';
import { SpecsService } from '../services/SpecsService';
import { CodeGenService } from '../services/CodeGenService';

let cached: { config: CockpitConfig; specs: SpecsService; codeGen: CodeGenService } | null = null;

// ConfigService.save() replaces the config object, so a new object means Settings changed:
// rebuild the services so new contract paths or workspace root apply without a restart.
function services(configService: ConfigService) {
  const config = configService.getConfig();
  if (!cached || cached.config !== config) {
    cached = {
      config,
      specs: new SpecsService(config.general.workspaceRoot, config.specs),
      codeGen: new CodeGenService(config.general.workspaceRoot),
    };
  }
  return cached;
}

const getSpecsService = (configService: ConfigService) => services(configService).specs;
const getCodeGenService = (configService: ConfigService) => services(configService).codeGen;

export function registerSpecsIpc(ipcMain: IpcMain, configService: ConfigService): void {
  ipcMain.handle('specs:discoverFiles', async () => {
    return getSpecsService(configService).discoverFiles();
  });

  ipcMain.handle('specs:readFile', async (_event, filePath: string) => {
    return getSpecsService(configService).readFile(filePath);
  });

  ipcMain.handle('specs:writeFile', async (_event, filePath: string, content: string) => {
    getSpecsService(configService).writeFile(filePath, content);
  });

  ipcMain.handle('specs:validate', async (_event, filePath: string, content: string) => {
    return getSpecsService(configService).validate(filePath, content);
  });

  ipcMain.handle('specs:getCodeGenTasks', async () => {
    return getCodeGenService(configService).getTasks();
  });

  ipcMain.handle('specs:runCodeGen', async (_event, taskId: string) => {
    return getCodeGenService(configService).runTask(taskId);
  });

  ipcMain.handle('specs:parseEntities', async () => {
    return getSpecsService(configService).parseEntities();
  });
}
