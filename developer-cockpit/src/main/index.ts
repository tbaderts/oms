import { app, BrowserWindow, dialog, ipcMain, protocol } from 'electron';
import * as fs from 'fs';
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
import { registerSpecTicketsIpc } from './ipc/specTickets.ipc';
import { registerApiExplorerIpc } from './ipc/apiExplorer.ipc';
import { registerStoryboardsIpc, type StoryboardsIpc } from './ipc/storyboards.ipc';
import { resolveStoryboardsConfig } from './services/ConfigService';
import { expandRoots } from './storyboards/roots';
import { parseAssetUrl, resolveAsset } from './storyboards/assets';
import { ASSET_SCHEME } from './storyboards/StoryboardService';
import { createApplicationMenu } from './menu';
import type { CockpitConfig } from '../shared/types/config';

/** Extra API Explorer template files live outside the watched folders; watch them by path. */
const templateWatchPaths = (config: CockpitConfig) =>
  (config.infrastructure.apiTemplateSources ?? []).filter((p) => p.trim()).map((p) => path.resolve(config.general.workspaceRoot, p.trim()));

/** Storyboard roots may live outside the fixed watched folders (configurable globs). */
const storyboardWatchPaths = (config: CockpitConfig) => {
  const sb = resolveStoryboardsConfig(config.storyboards);
  return sb.enabled ? expandRoots(config.general.workspaceRoot, sb.roots).roots.map((r) => r.dir) : [];
};
const extraWatchPaths = (config: CockpitConfig) => [...templateWatchPaths(config), ...storyboardWatchPaths(config)];

// Illustrations reach <img> through this scheme only, never as file:// URLs (SPEC-0014).
protocol.registerSchemesAsPrivileged([{ scheme: ASSET_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: false } }]);

let mainWindow: BrowserWindow | null = null;
let configService: ConfigService;
let watcherService: WatcherService;
let wsServer: WebSocketServer;
let storyboards: StoryboardsIpc;

// COCKPIT_WS_PORT lets an end-to-end run start next to a running cockpit (the page CSP still only allows 9321).
const WS_PORT = Number(process.env.COCKPIT_WS_PORT) || 9321;
const isDev = process.env.DEV_SERVER === 'true';

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Developer Cockpit',
    // The menu bar stays out of the way: Alt shows it, and its shortcuts work while it is hidden.
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  if (isDev) {
    await mainWindow.loadURL('http://localhost:5180');
    // DevTools on request only (COCKPIT_DEVTOOLS=1); Ctrl+Shift+I or View → Toggle Developer Tools opens them any time.
    if (process.env.COCKPIT_DEVTOOLS === '1') mainWindow.webContents.openDevTools({ mode: 'bottom' });
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
  watcherService.setExtraPaths(extraWatchPaths(config));
}

function registerAllIpc(): void {
  registerConfigIpc(ipcMain, configService, (config) => {
    watcherService.setExtraPaths(extraWatchPaths(config));
    storyboards.reconfigure(configService.getConfig());
  });
  registerShellIpc(ipcMain);
  registerEventsIpc(ipcMain, WS_PORT);
  registerKbIpc(ipcMain, configService);
  registerFsIpc(ipcMain, configService);
  registerRequirementsIpc(ipcMain, configService);
  registerGitIpc(ipcMain, configService);
  registerSpecsIpc(ipcMain, configService);
  registerSpecTicketsIpc(ipcMain, configService);
  registerApiExplorerIpc(ipcMain, configService);
  storyboards = registerStoryboardsIpc(ipcMain, {
    configService,
    broadcast: (event) => wsServer.broadcast(event),
    chooseSaveFile: async (defaultName, extension) => {
      const filters = { mmd: { name: 'Mermaid', extensions: ['mmd'] }, html: { name: 'HTML', extensions: ['html'] }, pdf: { name: 'PDF', extensions: ['pdf'] } };
      const options = { defaultPath: defaultName, filters: [filters[extension]] };
      const result = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options);
      return result.canceled || !result.filePath ? null : result.filePath;
    },
    writeFile: (file, content) => fs.writeFileSync(file, content),
    printToPdf: async (html) => {
      // A hidden window without script or node access renders the script-free handout.
      const win = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false } });
      try {
        await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
        return await win.webContents.printToPDF({ printBackground: true });
      } finally {
        win.destroy();
      }
    },
  });
  watcherService.onPath((filePath, kind) => storyboards.onWatcherPath(filePath, kind));
}

function registerAssetProtocol(): void {
  protocol.handle(ASSET_SCHEME, (request) => {
    const parsed = parseAssetUrl(request.url);
    const asset = parsed ? resolveAsset(storyboards.service(), parsed.id, parsed.name) : { status: 400 as const, headers: {} as Record<string, string> };
    if (asset.status !== 200) console.warn(`[storyboards] asset refused (${asset.status}): ${request.url}`);
    return new Response(asset.status === 200 && 'body' in asset && asset.body ? new Uint8Array(asset.body) : null, { status: asset.status, headers: asset.headers });
  });
}

app.whenReady().then(async () => {
  await initServices();
  registerAllIpc();
  registerAssetProtocol();
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
