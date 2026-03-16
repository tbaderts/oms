import type { IpcMain } from 'electron';
import type { ConfigService } from '../services/ConfigService';
import { GitService } from '../services/GitService';

let gitService: GitService | null = null;

function getGitService(configService: ConfigService): GitService {
  if (!gitService) {
    const config = configService.getConfig();
    gitService = new GitService(config.general.workspaceRoot, config.scm.defaultBranch);
  }
  return gitService;
}

export function registerGitIpc(ipcMain: IpcMain, configService: ConfigService): void {
  ipcMain.handle('git:getStatus', async () => {
    const svc = getGitService(configService);
    return svc.getStatus();
  });

  ipcMain.handle('git:getLog', async (_event, limit?: number) => {
    const svc = getGitService(configService);
    return svc.getLog(limit);
  });

  ipcMain.handle('git:getDiff', async (_event, ref?: string) => {
    const svc = getGitService(configService);
    return svc.getDiff(ref);
  });

  ipcMain.handle('git:getFileDiff', async (_event, path: string) => {
    const svc = getGitService(configService);
    return svc.getFileDiff(path);
  });

  ipcMain.handle('git:getBranches', async () => {
    const svc = getGitService(configService);
    return svc.getBranches();
  });

  ipcMain.handle('git:createBranch', async (_event, name: string) => {
    const svc = getGitService(configService);
    return svc.createBranch(name);
  });

  ipcMain.handle('git:checkoutBranch', async (_event, name: string) => {
    const svc = getGitService(configService);
    return svc.checkoutBranch(name);
  });

  ipcMain.handle('git:deleteBranch', async (_event, name: string, force?: boolean) => {
    const svc = getGitService(configService);
    return svc.deleteBranch(name, force);
  });
}
