import { type IpcMain, shell, app } from 'electron';

export function registerShellIpc(ipcMain: IpcMain): void {
  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    await shell.openExternal(url);
  });

  ipcMain.handle('shell:showItemInFolder', async (_event, path: string) => {
    shell.showItemInFolder(path);
  });

  ipcMain.handle('shell:getAppVersion', async () => {
    return app.getVersion();
  });

  ipcMain.handle('shell:getPlatform', async () => {
    return process.platform;
  });
}
