import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The UI dev server (5181; developer-cockpit uses 5180) proxies the API to the Mission Control
// server on 8097. In production the server serves dist/ui itself.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5181,
    strictPort: true,
    proxy: { '/mc': 'http://127.0.0.1:8097' },
  },
  build: { outDir: 'dist/ui', emptyOutDir: true },
});
