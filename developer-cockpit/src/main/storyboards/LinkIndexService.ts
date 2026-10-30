import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import type { LinkIndex } from '../../shared/types/storyboards';
import { parseFrontMatter } from './parse';

export interface LinkIndexOptions {
  workspaceRoot: string;
  kbPath: string;
  /** Workspace-relative folders with OpenAPI files (the cockpit's `specs.openApiPaths`). */
  openApiPaths: string[];
  /** Workspace-relative folders with Avro schemas (`specs.avroPaths`). */
  avroPaths: string[];
}

const REQUIREMENT_DIRS = ['functional-requirements', 'non-functional-requirements'];
const STATE_DOC = path.join('domain', 'order-state.md');
const REQUIREMENT_ID = /^(N?FR-\d{3,})/;
const TRANSITION = /^\s*([A-Za-z_][\w]*)\s*-->\s*([A-Za-z_][\w]*)\b/;

/**
 * Valid link targets for storyboard steps, built from the contracts and the knowledge base and
 * cached until a source changes (source-spec §5.6). Unknown targets are warnings, never errors.
 */
export class LinkIndexService {
  private cache: LinkIndex | null = null;

  constructor(private readonly opts: LinkIndexOptions) {}

  get(): LinkIndex {
    if (!this.cache) this.cache = this.build();
    return this.cache;
  }

  invalidate(): void {
    this.cache = null;
  }

  /** True when a change to this file can change the index. */
  isSource(file: string): boolean {
    const abs = path.resolve(file);
    const under = (dir: string) => abs.startsWith(path.resolve(dir) + path.sep);
    if (this.opts.openApiPaths.some((p) => under(path.resolve(this.opts.workspaceRoot, p)))) return true;
    if (this.opts.avroPaths.some((p) => under(path.resolve(this.opts.workspaceRoot, p)))) return true;
    if (REQUIREMENT_DIRS.some((d) => under(path.join(this.opts.kbPath, d)))) return true;
    return abs === path.resolve(this.opts.kbPath, STATE_DOC);
  }

  private build(): LinkIndex {
    const api = new Set<string>();
    for (const file of this.files(this.opts.openApiPaths, ['.yml', '.yaml'])) {
      const stem = path.basename(file).replace(/\.ya?ml$/, '');
      let doc: unknown;
      try {
        doc = parseYaml(fs.readFileSync(file, 'utf8'));
      } catch {
        continue;
      }
      for (const operation of Object.values(obj(obj(doc).paths)).flatMap((p) => Object.values(obj(p)))) {
        const id = obj(operation).operationId;
        if (typeof id === 'string') api.add(`${stem}#${id}`);
      }
      // One operation carries every command; its discriminator values are what steps really use.
      for (const schema of Object.values(obj(obj(obj(doc).components).schemas))) {
        for (const type of Object.keys(obj(obj(obj(schema).discriminator).mapping))) api.add(`${stem}#${type}`);
      }
    }

    const events = new Set<string>();
    for (const file of this.files(this.opts.avroPaths, ['.avsc'])) {
      let schema: unknown;
      try {
        schema = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch {
        continue;
      }
      for (const s of Array.isArray(schema) ? schema : [schema]) {
        if (obj(s).type === 'record' && typeof obj(s).name === 'string') events.add(obj(s).name as string);
      }
    }

    const states = new Set<string>();
    try {
      let inDiagram = false;
      for (const line of fs.readFileSync(path.join(this.opts.kbPath, STATE_DOC), 'utf8').split(/\r?\n/)) {
        if (/^\s*stateDiagram/.test(line)) inDiagram = true;
        else if (/^\s*```/.test(line)) inDiagram = false;
        const m = inDiagram ? TRANSITION.exec(line) : null;
        if (m) states.add(`${m[1]} -> ${m[2]}`);
      }
    } catch {
      // no state document: the category stays empty and is not checked
    }

    const requirements = new Set<string>();
    for (const dir of REQUIREMENT_DIRS) {
      let names: string[] = [];
      try {
        names = fs.readdirSync(path.join(this.opts.kbPath, dir));
      } catch {
        continue;
      }
      for (const name of names.filter((n) => n.endsWith('.md'))) {
        let id: unknown;
        try {
          id = parseFrontMatter(fs.readFileSync(path.join(this.opts.kbPath, dir, name), 'utf8')).data.id;
        } catch {
          id = undefined;
        }
        const resolved = typeof id === 'string' && id ? id : REQUIREMENT_ID.exec(name)?.[1];
        if (resolved) requirements.add(resolved);
      }
    }

    const sorted = (s: Set<string>) => [...s].sort();
    return { api: sorted(api), events: sorted(events), states: sorted(states), requirements: sorted(requirements) };
  }

  private files(dirs: string[], extensions: string[]): string[] {
    const out: string[] = [];
    for (const dir of dirs) {
      const abs = path.resolve(this.opts.workspaceRoot, dir);
      let names: string[] = [];
      try {
        names = fs.readdirSync(abs);
      } catch {
        continue;
      }
      for (const name of names) if (extensions.some((e) => name.endsWith(e))) out.push(path.join(abs, name));
    }
    return out;
  }
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
