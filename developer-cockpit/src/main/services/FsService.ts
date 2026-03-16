import * as fs from 'fs';
import * as path from 'path';
import type { FsEntry, FsStat } from '../../shared/types/fs';

export class FsService {
  constructor(private workspaceRoot: string) {}

  private validatePath(requestedPath: string): string {
    const resolved = path.resolve(this.workspaceRoot, requestedPath);
    const normalized = path.normalize(resolved);
    if (!normalized.startsWith(path.normalize(this.workspaceRoot))) {
      throw new Error('Access denied: path is outside workspace root');
    }
    return normalized;
  }

  readDir(dirPath: string): FsEntry[] {
    const safePath = this.validatePath(dirPath);
    if (!fs.existsSync(safePath)) return [];

    const entries = fs.readdirSync(safePath, { withFileTypes: true });
    return entries
      .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules')
      .map((e) => {
        const fullPath = path.join(safePath, e.name);
        let size = 0;
        try {
          if (e.isFile()) size = fs.statSync(fullPath).size;
        } catch { /* ignore */ }
        return {
          name: e.name,
          path: fullPath,
          isDirectory: e.isDirectory(),
          isFile: e.isFile(),
          extension: e.isFile() ? path.extname(e.name) : '',
          size,
        };
      })
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }

  readFile(filePath: string): string {
    const safePath = this.validatePath(filePath);
    return fs.readFileSync(safePath, 'utf-8');
  }

  stat(filePath: string): FsStat {
    const safePath = this.validatePath(filePath);
    const s = fs.statSync(safePath);
    return {
      size: s.size,
      isDirectory: s.isDirectory(),
      isFile: s.isFile(),
      created: s.birthtimeMs,
      modified: s.mtimeMs,
    };
  }
}
