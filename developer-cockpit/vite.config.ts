import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import type { Plugin } from 'vite';

/**
 * Excalidraw lists a CDN (esm.sh) after the local asset path in every font source, and Chromium
 * still requests it. Point that fallback at the self-hosted copy too, so the build has no remote URL.
 */
export const EXCALIDRAW_CDN_FALLBACK = /"ASSETS_FALLBACK_URL",\s*`https:\/\/esm\.sh\/[\s\S]*?\/dist\/prod\/`\)/;

function excalidrawLocalAssets(): Plugin {
  return {
    name: 'excalidraw-local-assets',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('@excalidraw') || !EXCALIDRAW_CDN_FALLBACK.test(code)) return null;
      return {
        code: code.replace(EXCALIDRAW_CDN_FALLBACK, '"ASSETS_FALLBACK_URL", new URL("./excalidraw-assets/", document.baseURI).href)'),
        map: null,
      };
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), excalidrawLocalAssets()],
  root: 'src/renderer',
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
  server: {
    port: 5180,
    strictPort: true,
  },
});
