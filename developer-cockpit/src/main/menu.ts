import { Menu, shell, app, BrowserWindow } from 'electron';

export function createApplicationMenu(): void {
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
        { type: 'separator' },
        {
          label: 'OMS Documentation',
          click: () => shell.openExternal('http://localhost:8080/swagger-ui.html'),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
