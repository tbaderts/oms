// Copies Excalidraw's fonts next to the renderer so the illustration editor never fetches them from
// a CDN. Runs before `vite` (dev) and `vite build`; the output folder is gitignored.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'node_modules', '@excalidraw', 'excalidraw', 'dist', 'prod', 'fonts');
const target = join(root, 'src', 'renderer', 'public', 'excalidraw-assets', 'fonts');

if (!existsSync(source)) {
  console.error(`[excalidraw-assets] not found: ${source} (run npm install)`);
  process.exit(1);
}
rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
console.info(`[excalidraw-assets] copied fonts to ${target}`);
