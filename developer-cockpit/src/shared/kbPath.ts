/** The knowledge server names documents relative to the repository: `oms-knowledge-base/<path>`. */
export const KB_BUNDLE_PREFIX = 'oms-knowledge-base/';

/**
 * A knowledge-base document path as the cockpit's `KbService` knows it: relative to the KB root,
 * forward slashes, without the `oms-knowledge-base/` bundle prefix or a `#anchor` (SPEC-0062).
 */
export function normaliseKbPath(path: string): string {
  let p = path.trim().replace(/\\/g, '/');
  const hash = p.indexOf('#');
  if (hash >= 0) p = p.slice(0, hash);
  p = p.replace(/^\/+/, '');
  if (p.startsWith(KB_BUNDLE_PREFIX)) p = p.slice(KB_BUNDLE_PREFIX.length);
  return p;
}

/** Whether a path names a Markdown document. */
export function isKbDocumentPath(path: string): boolean {
  return /\.mdx?$/i.test(path);
}
