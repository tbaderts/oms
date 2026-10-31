import { defineConfig } from 'vitest/config';
import path from 'path';
import os from 'os';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['test/setup.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // Many tests spawn child processes (spec CLI, git); one worker per CPU oversubscribes
    // memory and makes the RPC between vitest and its workers time out. Half the CPUs,
    // at most 6, keeps the suite deterministic on shared machines.
    maxWorkers: Math.min(6, Math.max(2, Math.ceil(os.cpus().length / 2))),
    minWorkers: 1,
  },
});
