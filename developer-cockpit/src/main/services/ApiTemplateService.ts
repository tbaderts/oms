import * as fs from 'fs';
import * as path from 'path';
import { COMMAND_PATH, SHARED_TEMPLATE_DIR, type SaveTemplateRequest, type SaveTemplateResult, type TemplateSource } from '../../shared/apiExplorer';
import { effectiveNames, formatTemplateBlock, parseHttpFile } from '../../shared/httpFile';

const FILE_NAME = /^[\w.-]+\.http$/;
const MAX_NAME = 80;

/**
 * The API Explorer's `.http` template files (SPEC-0008): every file in the shared folder plus the
 * configured extra sources. Read on every call; saving only appends, and only to a listed source
 * or a new file in the shared folder.
 */
export class ApiTemplateService {
  constructor(
    private workspaceRoot: string,
    private extraSources: string[],
    private baseUrl: () => string,
  ) {}

  list(): TemplateSource[] {
    const sharedDir = path.join(this.workspaceRoot, SHARED_TEMPLATE_DIR);
    let shared: string[] = [];
    try {
      shared = fs.readdirSync(sharedDir).filter((f) => FILE_NAME.test(f)).sort();
    } catch {
      // no shared folder: only the configured sources
    }
    return [
      ...shared.map((f) => this.read(path.join(sharedDir, f), true)),
      ...this.extraSources.filter((s) => s.trim()).map((s) => this.read(path.resolve(this.workspaceRoot, s.trim()), false)),
    ];
  }

  save(req: SaveTemplateRequest): SaveTemplateResult {
    const name = req.name.trim();
    if (!name || name.length > MAX_NAME || /[\r\n]/.test(name)) return { ok: false, error: `Template name must be 1–${MAX_NAME} characters on one line` };

    try {
      if ('newFile' in req) {
        if (!FILE_NAME.test(req.newFile)) return { ok: false, error: 'File name must look like name.http' };
        const rel = `${SHARED_TEMPLATE_DIR}/${req.newFile}`;
        const file = path.join(this.workspaceRoot, rel);
        if (fs.existsSync(file)) return { ok: false, error: `${rel} already exists` };
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const header = `@baseUrl = ${this.baseUrl()}\n`;
        fs.writeFileSync(file, header + formatTemplateBlock(name, `{{baseUrl}}${COMMAND_PATH}`, req.body), { flag: 'wx' });
        return this.saved(name, rel);
      }

      const source = this.list().find((s) => s.path === req.path);
      if (!source || source.missing || !source.file) return { ok: false, error: `Not a template source: ${req.path}` };
      if (effectiveNames(source.file).includes(name)) {
        return { ok: false, error: `A template named "${name}" already exists in ${source.path}` };
      }
      const file = this.absolute(source.path);
      const text = fs.readFileSync(file, 'utf8');
      const url = 'baseUrl' in source.file.variables ? `{{baseUrl}}${COMMAND_PATH}` : `${this.baseUrl().replace(/\/+$/, '')}${COMMAND_PATH}`;
      // Appending keeps every byte already in the file; only a missing final newline is added.
      // The block takes the file's line endings.
      const eol = text.includes('\r\n') ? '\r\n' : '\n';
      const block = (text === '' || text.endsWith('\n') ? '' : '\n') + formatTemplateBlock(name, url, req.body);
      fs.appendFileSync(file, eol === '\n' ? block : block.replace(/\r?\n/g, eol));
      return this.saved(name, source.path);
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  private saved(name: string, rel: string): SaveTemplateResult {
    console.info(`[api-explorer] template saved ${name} → ${rel}`);
    return { ok: true, path: rel };
  }

  private read(file: string, shared: boolean): TemplateSource {
    const p = this.display(file);
    if (!fs.existsSync(file)) return { path: p, shared, missing: true };
    try {
      return { path: p, shared, file: parseHttpFile(fs.readFileSync(file, 'utf8')) };
    } catch (err) {
      return { path: p, shared, error: (err as Error).message };
    }
  }

  /** Workspace-relative with forward slashes; absolute for a file outside the workspace. */
  private display(file: string): string {
    const rel = path.relative(this.workspaceRoot, file);
    return (rel.startsWith('..') || path.isAbsolute(rel) ? file : rel).replace(/\\/g, '/');
  }

  private absolute(p: string): string {
    return path.resolve(this.workspaceRoot, p);
  }
}
