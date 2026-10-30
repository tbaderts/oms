import * as fs from 'fs';
import * as path from 'path';
import { ASSET_NAME } from '../../shared/storyboards/ids';
import { ASSET_SCHEME, type StoryboardService } from './StoryboardService';

export interface AssetResponse {
  status: 200 | 400 | 404 | 413;
  headers: Record<string, string>;
  body?: Buffer;
}

const CONTENT_TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

/** SVGs render as images only: no scripts, no network; inline styles, images and fonts stay usable. */
export const SVG_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:";

const fail = (status: AssetResponse['status']): AssetResponse => ({ status, headers: { 'X-Content-Type-Options': 'nosniff' } });

/** `storyboard-asset://<id>/<name>` → raw id and decoded name; null for any other URL. */
export function parseAssetUrl(url: string): { id: string; name: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== `${ASSET_SCHEME}:`) return null;
  let name: string;
  try {
    name = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
  } catch {
    return null;
  }
  return { id: u.hostname, name };
}

/**
 * Serves one illustration by storyboard id and flat file name (source-spec §7.5). The id must be in
 * the last scan; the file must be a regular, non-symlinked file inside that storyboard's assets/
 * folder, also after resolving real paths, and within the size limit.
 */
export function resolveAsset(service: StoryboardService, id: string, name: string): AssetResponse {
  const entry = service.entry(id);
  if (!entry) return fail(404);
  if (typeof name !== 'string' || !ASSET_NAME.test(name)) return fail(400);

  const assetsDir = path.join(entry.dir, 'assets');
  const file = path.join(assetsDir, name);
  let st: fs.Stats;
  let realDir: string;
  let realFile: string;
  try {
    const dirStat = fs.lstatSync(assetsDir);
    if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) return fail(404);
    st = fs.lstatSync(file);
    realDir = fs.realpathSync(assetsDir);
    realFile = fs.realpathSync(file);
  } catch {
    return fail(404);
  }
  if (st.isSymbolicLink() || !st.isFile()) return fail(404);
  if (!realFile.startsWith(realDir + path.sep) || realDir !== path.join(fs.realpathSync(entry.dir), 'assets')) return fail(404);
  if (st.size > service.config.maxAssetBytes) return fail(413);

  const body = fs.readFileSync(realFile);
  if (body.length > service.config.maxAssetBytes) return fail(413);
  const type = CONTENT_TYPES[path.extname(name).toLowerCase()];
  return {
    status: 200,
    headers: {
      'Content-Type': type,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
      ...(type === 'image/svg+xml' && { 'Content-Security-Policy': SVG_CSP }),
    },
    body,
  };
}
