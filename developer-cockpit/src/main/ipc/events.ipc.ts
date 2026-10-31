import type { IpcMain } from 'electron';
import { WS_HOST } from '../websocket/server';

export function registerEventsIpc(ipcMain: IpcMain, wsPort: number): void {
  ipcMain.handle('events:getWebSocketUrl', async () => {
    return `ws://${WS_HOST}:${wsPort}`;
  });
}
