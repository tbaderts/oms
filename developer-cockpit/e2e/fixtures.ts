import { test as base, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const COCKPIT_ROOT = path.resolve(__dirname, '..');

export interface CockpitFixtures {
  /** A throw-away workspace root; tests populate it before `launch`. */
  workspace: string;
  launch: () => Promise<{ app: ElectronApplication; page: Page }>;
}

/**
 * Launches the built cockpit against a temporary workspace and config directory, so a run never
 * reads or writes the developer's real workspace or ~/.developer-cockpit.
 */
export const test = base.extend<CockpitFixtures>({
  workspace: async ({}, use) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-e2e-'));
    fs.mkdirSync(path.join(root, 'oms-knowledge-base'), { recursive: true });
    await use(root);
    fs.rmSync(root, { recursive: true, force: true });
  },
  launch: async ({ workspace }, use) => {
    const apps: ElectronApplication[] = [];
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-e2e-config-'));
    await use(async () => {
      // VS Code and similar hosts export ELECTRON_RUN_AS_NODE, which would start Electron as plain Node.
      const env = { ...process.env } as Record<string, string>;
      delete env.ELECTRON_RUN_AS_NODE;
      const app = await electron.launch({
        args: [path.join(COCKPIT_ROOT, 'dist', 'main', 'index.js')],
        cwd: COCKPIT_ROOT,
        env: {
          ...env,
          COCKPIT_WS_PORT: String(19321 + Math.floor(Math.random() * 1000)),
          COCKPIT_WORKSPACE_ROOT: workspace,
          COCKPIT_CONFIG_DIR: configDir,
        },
      });
      apps.push(app);
      const page = await app.firstWindow();
      await page.waitForLoadState('domcontentloaded');
      return { app, page };
    });
    for (const app of apps) await app.close().catch(() => undefined);
    fs.rmSync(configDir, { recursive: true, force: true });
  },
});

export { expect } from '@playwright/test';
