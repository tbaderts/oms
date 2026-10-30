import * as fs from 'fs';
import * as path from 'path';
import { parseFrontMatter, readBounded } from './parse';

const REQUIREMENT_DIRS = ['functional-requirements', 'non-functional-requirements'];
const MAX_BYTES = 64 * 1024;

/**
 * Text of a requirement id (FR-001) or a knowledge-base document (/domain/order.md) for an AI
 * prompt: front matter removed, bounded, and only from inside the knowledge base.
 */
export function kbExtractReader(kbPath: string): (ref: string) => string | null {
  const kb = path.resolve(kbPath);
  const read = (file: string): string | null => {
    const abs = path.resolve(file);
    if (!abs.startsWith(kb + path.sep)) return null;
    const r = readBounded(abs, MAX_BYTES);
    if (!r.ok) return null;
    try {
      return parseFrontMatter(r.text).body.trim();
    } catch {
      return r.text.trim();
    }
  };
  return (ref) => {
    if (/^N?FR-\d+$/.test(ref)) {
      for (const dir of REQUIREMENT_DIRS) {
        let names: string[] = [];
        try {
          names = fs.readdirSync(path.join(kb, dir));
        } catch {
          continue;
        }
        const name = names.find((n) => n === `${ref}.md` || n.startsWith(`${ref}-`));
        if (name) return read(path.join(kb, dir, name));
      }
      return null;
    }
    const rel = ref.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!rel.endsWith('.md') || rel.split('/').includes('..')) return null;
    return read(path.join(kb, rel));
  };
}
