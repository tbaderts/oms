/**
 * The knowledge server names documents relative to the repository: `<knowledge-base root>/<path>`.
 * The prefix follows the configured root (SPEC-0076); each process sets it when the config loads.
 */
let prefix = 'knowledge-base/';

/** `knowledge-base` → `knowledge-base/`; `./kb/` → `kb/`. */
export function setKbBundlePrefix(kbRoot: string): void {
  const root = kbRoot.trim().replace(/\\/g, '/').replace(/^\.?\/+|\/+$/g, '');
  prefix = root ? `${root}/` : '';
}

/** The prefix knowledge-server paths carry, e.g. `knowledge-base/`. */
export function kbBundlePrefix(): string {
  return prefix;
}

/**
 * A knowledge-base document path as the cockpit's `KbService` knows it: relative to the KB root,
 * forward slashes, without the bundle prefix or a `#anchor` (SPEC-0062).
 */
export function normaliseKbPath(path: string): string {
  let p = path.trim().replace(/\\/g, '/');
  const hash = p.indexOf('#');
  if (hash >= 0) p = p.slice(0, hash);
  p = p.replace(/^\/+/, '');
  if (prefix && p.startsWith(prefix)) p = p.slice(prefix.length);
  return p;
}

/** Whether a path names a Markdown document. */
export function isKbDocumentPath(path: string): boolean {
  return /\.mdx?$/i.test(path);
}
