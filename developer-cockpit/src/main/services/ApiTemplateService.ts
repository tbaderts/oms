import * as fs from 'fs';
import * as path from 'path';
import type { SaveTemplateRequest, SaveTemplateResult, TemplateSource } from '../../shared/apiExplorer';
import { HTTP_METHODS } from '../../shared/apiExplorer';
import { effectiveNames, formatTemplateBlock, parseHttpFile } from '../../shared/httpFile';

const FILE_NAME = /^[\w.-]+\.http$/;
const MAX_NAME = 80;

/**
 * The API Explorer's `.http` template files (SPEC-0008, SPEC-0076): the sources a project lists
 * in `apiExplorer.templateSources` (or in Settings). Read on every call; saving only appends, to a
 * listed source or to a new file next to the first listed source.
 */
export class ApiTemplateService {
  constructor(
    private workspaceRoot: string,
    private sources: string[],
  ) {}

  list(): TemplateSource[] {
    return this.sources.filter((s) => s.trim()).map((s) => this.read(path.resolve(this.workspaceRoot, s.trim())));
  }

  save(req: SaveTemplateRequest): SaveTemplateResult {
    const name = req.name.trim();
    if (!name || name.length > MAX_NAME || /[\r\n]/.test(name)) return { ok: false, error: `Template name must be 1–${MAX_NAME} characters on one line` };
    const method = req.method.toUpperCase();
    if (!(HTTP_METHODS as readonly string[]).includes(method)) return { ok: false, error: `Unsupported method ${req.method}` };
    if (!req.url.trim() || /\s/.test(req.url.trim())) return { ok: false, error: 'The URL must be one word without spaces' };

    try {
      if ('newFile' in req) {
        if (!FILE_NAME.test(req.newFile)) return { ok: false, error: 'File name must look like name.http' };
        const first = this.list()[0];
        if (!first) return { ok: false, error: 'List a template file under apiExplorer.templateSources in cockpit.yaml first' };
        const file = path.join(path.dirname(this.absolute(first.path)), req.newFile);
        const rel = this.display(file);
        if (fs.existsSync(file)) return { ok: false, error: `${rel} already exists` };
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, formatTemplateBlock(name, method, req.url.trim(), req.body).replace(/^\n/, ''), { flag: 'wx' });
        return this.saved(name, rel);
      }

      const source = this.list().find((s) => s.path === req.path);
      if (!source || source.missing || !source.file) return { ok: false, error: `Not a template source: ${req.path}` };
      if (effectiveNames(source.file).includes(name)) {
        return { ok: false, error: `A template named "${name}" already exists in ${source.path}` };
      }
      const file = this.absolute(source.path);
      const text = fs.readFileSync(file, 'utf8');
      // Appending keeps every byte already in the file; only a missing final newline is added.
      // The block takes the file's line endings.
      const eol = text.includes('\r\n') ? '\r\n' : '\n';
      const block = (text === '' || text.endsWith('\n') ? '' : '\n') + formatTemplateBlock(name, method, req.url.trim(), req.body);
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

  private read(file: string): TemplateSource {
    const p = this.display(file);
    if (!fs.existsSync(file)) return { path: p, missing: true };
    try {
      return { path: p, file: parseHttpFile(fs.readFileSync(file, 'utf8')) };
    } catch (err) {
      return { path: p, error: (err as Error).message };
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
