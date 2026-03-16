import type { IpcMain } from 'electron';

export function registerEventsIpc(ipcMain: IpcMain, wsPort: number): void {
  ipcMain.handle('events:getWebSocketUrl', async () => {
    return `ws://localhost:${wsPort}`;
  });
}
