import { Menu, shell, app, BrowserWindow } from 'electron';
import type { ProjectLink } from '../shared/projectConfig';

/** The project's links from cockpit.yaml as Help menu items, after a separator; none when empty. */
export function helpLinkItems(links: ProjectLink[], open: (url: string) => unknown = (url) => shell.openExternal(url)): Electron.MenuItemConstructorOptions[] {
  if (!links.length) return [];
  return [{ type: 'separator' }, ...links.map((l) => ({ label: l.label, click: () => void open(l.url) }))];
}

export function createApplicationMenu(links: ProjectLink[] = []): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            win?.webContents.send('navigate', 'settings');
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Go',
      submenu: [
        {
          label: 'Command Palette',
          accelerator: 'CmdOrCtrl+K',
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            win?.webContents.send('toggle-command-palette');
          },
        },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Developer Cockpit',
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win) {
              const { dialog } = require('electron');
              dialog.showMessageBox(win, {
                type: 'info',
                title: 'Developer Cockpit',
                message: `Developer Cockpit v${app.getVersion()}`,
                detail: 'Unified workbench for spec-driven development.',
              });
            }
          },
        },
        ...helpLinkItems(links),
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
