import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { ConfigService } from './services/ConfigService';
import { WatcherService } from './services/WatcherService';
import { WebSocketServer } from './websocket/server';
import { registerConfigIpc } from './ipc/config.ipc';
import { registerShellIpc } from './ipc/shell.ipc';
import { registerEventsIpc } from './ipc/events.ipc';
import { registerKbIpc } from './ipc/kb.ipc';
import { registerFsIpc } from './ipc/fs.ipc';
import { registerRequirementsIpc } from './ipc/requirements.ipc';
import { registerGitIpc } from './ipc/git.ipc';
import { registerSpecsIpc } from './ipc/specs.ipc';
import { createApplicationMenu } from './menu';

let mainWindow: BrowserWindow | null = null;
let configService: ConfigService;
let watcherService: WatcherService;
let wsServer: WebSocketServer;

const WS_PORT = 9321;
const isDev = process.env.DEV_SERVER === 'true';

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Developer Cockpit',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  if (isDev) {
    await mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'bottom' });
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function initServices(): Promise<void> {
  configService = new ConfigService();
  await configService.load();

  wsServer = new WebSocketServer(WS_PORT);
  wsServer.start();

  const config = configService.getConfig();
  watcherService = new WatcherService(config.general.workspaceRoot, wsServer);
}

function registerAllIpc(): void {
  registerConfigIpc(ipcMain, configService);
  registerShellIpc(ipcMain);
  registerEventsIpc(ipcMain, WS_PORT);
  registerKbIpc(ipcMain, configService);
  registerFsIpc(ipcMain, configService);
  registerRequirementsIpc(ipcMain, configService);
  registerGitIpc(ipcMain, configService);
  registerSpecsIpc(ipcMain, configService);
}

app.whenReady().then(async () => {
  await initServices();
  registerAllIpc();
  createApplicationMenu();
  await createWindow();

  // Defer file watcher startup so it doesn't block the initial render.
  // Chokidar's directory enumeration is I/O-heavy and can make the app
  // feel sluggish if it runs before the window is interactive.
  setTimeout(() => watcherService.start(), 1500);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  watcherService?.stop();
  wsServer?.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
