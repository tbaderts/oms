import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Component tests only (SPEC-0066): `src/**/*.test.tsx` in jsdom. The pure `src/**/*.test.ts`
// suites use `node --test` and are run by the first half of `npm test`.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // No passWithNoTests: if this glob ever matches nothing, the run (and the build) must fail.
    include: ['src/**/*.test.tsx'],
  },
});
