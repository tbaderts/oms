import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface ResolvedRoot {
  /** Opaque capability handed to the renderer; resolving it back needs the last scan. */
  rootId: string;
  /** Real absolute folder. */
  dir: string;
  /** Workspace-relative, '/'-separated, for display. */
  label: string;
}

export interface RootExpansion {
  roots: ResolvedRoot[];
  /** Configured patterns that matched no existing folder. */
  missing: string[];
}

export function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

export function rootIdOf(realDir: string): string {
  return crypto.createHash('sha256').update(realDir.toLowerCase()).digest('hex').slice(0, 12);
}

const isPlainDir = (p: string) => {
  try {
    const st = fs.lstatSync(p);
    return st.isDirectory() && !st.isSymbolicLink();
  } catch {
    return false;
  }
};

/**
 * Expands configured root patterns against the workspace root. A `*` segment matches one directory
 * level (dot folders excluded); other segments are literal. Symlinked folders never match, and a
 * root that resolves outside the workspace is dropped.
 */
export function expandRoots(workspaceRoot: string, patterns: string[]): RootExpansion {
  const workspace = fs.realpathSync(workspaceRoot);
  const roots: ResolvedRoot[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();

  for (const pattern of patterns) {
    const segments = pattern.replace(/\\/g, '/').split('/').filter((s) => s && s !== '.');
    if (segments.includes('..') || path.isAbsolute(pattern)) {
      missing.push(pattern);
      continue;
    }
    let candidates = [workspace];
    for (const segment of segments) {
      const next: string[] = [];
      for (const dir of candidates) {
        if (segment === '*') {
          let entries: fs.Dirent[] = [];
          try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
          } catch {
            continue;
          }
          for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
            if (!e.name.startsWith('.') && e.name !== 'node_modules' && isPlainDir(path.join(dir, e.name))) next.push(path.join(dir, e.name));
          }
        } else if (isPlainDir(path.join(dir, segment))) {
          next.push(path.join(dir, segment));
        }
      }
      candidates = next;
    }
    const matched = candidates.filter((dir) => {
      const real = fs.realpathSync(dir);
      return real === workspace || real.startsWith(workspace + path.sep);
    });
    if (matched.length === 0) missing.push(pattern);
    for (const dir of matched) {
      const real = fs.realpathSync(dir);
      if (seen.has(real)) continue;
      seen.add(real);
      roots.push({ rootId: rootIdOf(real), dir: real, label: toPosix(path.relative(workspace, real)) || '.' });
    }
  }
  return { roots, missing };
}
