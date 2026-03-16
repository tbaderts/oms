import type { IpcMain } from 'electron';
import type { ConfigService } from '../services/ConfigService';
import { SpecsService } from '../services/SpecsService';
import { CodeGenService } from '../services/CodeGenService';

let specsService: SpecsService | null = null;
let codeGenService: CodeGenService | null = null;

function getSpecsService(configService: ConfigService): SpecsService {
  if (!specsService) {
    const config = configService.getConfig();
    specsService = new SpecsService(config.general.workspaceRoot, config.specs);
  }
  return specsService;
}

function getCodeGenService(configService: ConfigService): CodeGenService {
  if (!codeGenService) {
    codeGenService = new CodeGenService(configService.getWorkspaceRoot());
  }
  return codeGenService;
}

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
