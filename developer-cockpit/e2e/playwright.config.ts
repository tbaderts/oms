import { defineConfig } from '@playwright/test';

/** Electron end-to-end tests; they run against the production build (`npm run test:e2e` builds first). */
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  timeout: 120_000,
  workers: 1,
  reporter: [['list']],
});
