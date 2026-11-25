import { isKbDocumentPath, kbBundlePrefix, normaliseKbPath } from '@shared/kbPath';

/** The part of an `ai:*` event the source extraction looks at. */
export interface KbChatToolEvent {
  type: string;
  name?: unknown;
  input?: unknown;
  output?: unknown;
  [key: string]: unknown;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** `<kb root>/<path>.md` citations in the knowledge server's Markdown output. */
export const citationPattern = () => new RegExp(`${escapeRegExp(kbBundlePrefix())}[^\\s\`'"()<>#]+?\\.mdx?(?=[#\\s\`'")<>]|$)`, 'gi');
/** `"path":"<path>.md"` entries in the local search tool's JSON output. */
const JSON_PATH = /"path"\s*:\s*"([^"]+?\.mdx?)"/gi;

/**
 * The knowledge-base documents a KB chat run's tools found or read (AC-4): KB-relative paths,
 * de-duplicated, in first-seen order. Only tool events count; the model's own text does not.
 */
export function extractSources(events: KbChatToolEvent[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw: string) => {
    const p = normaliseKbPath(raw);
    if (!p || !isKbDocumentPath(p) || seen.has(p)) return;
    seen.add(p);
    out.push(p);
  };

  for (const e of events) {
    if (e.type === 'ai:tool-call') {
      const input = e.input as { path?: unknown } | undefined;
      if (input && typeof input.path === 'string') add(input.path);
    } else if (e.type === 'ai:tool-result' && typeof e.output === 'string') {
      for (const m of e.output.matchAll(citationPattern())) add(m[0]);
      for (const m of e.output.matchAll(JSON_PATH)) add(m[1]);
    }
  }
  return out;
}
