// Resolution of markdown links and sources inside the OKF bundle, with the same rules as the MCP
// server's ConceptLinks and tools/okf-check: `/x` is relative to the bundle root, other paths to the
// linking document's folder; a folder means its index.md; anything outside the bundle is not in-app.

export type DocLink =
  | { kind: 'doc'; path: string; anchor?: string }
  | { kind: 'anchor'; anchor: string }
  | { kind: 'external'; href: string };

export type Source =
  | { kind: 'doc'; path: string }
  | { kind: 'repo'; path: string }
  | { kind: 'url'; href: string }
  | { kind: 'text'; value: string };

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Resolves `href` found in the document at `currentPath` (a portable path such as
 * `oms-knowledge-base/capabilities/order-capture.md`). Returns null for links that do not stay in
 * the bundle.
 */
export function resolveDocLink(currentPath: string, href: string): DocLink | null {
  if (!href) return null;
  if (SCHEME.test(href)) return { kind: 'external', href };
  if (href.startsWith('#')) return { kind: 'anchor', anchor: href.slice(1) };

  const hashAt = href.indexOf('#');
  const anchor = hashAt >= 0 ? href.slice(hashAt + 1) : undefined;
  let target = href.slice(0, hashAt >= 0 ? hashAt : undefined).replace(/\?.*$/, '');
  try {
    target = decodeURIComponent(target);
  } catch {
    // keep the raw target
  }
  if (!target) return anchor !== undefined ? { kind: 'anchor', anchor } : null;

  const base = currentPath.split('/')[0];
  const folder = currentPath.split('/').slice(0, -1);
  const segments = target.startsWith('/') ? [base, ...target.slice(1).split('/')] : [...folder, ...target.split('/')];
  const resolved: string[] = [];
  for (const segment of segments) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (resolved.length <= 1) return null; // would leave the bundle
      resolved.pop();
    } else {
      resolved.push(segment);
    }
  }
  if (resolved[0] !== base || resolved.length < 2) return null;

  // Markdown files are documents; a folder (trailing slash, or no extension) means its index.md;
  // other files (images, YAML, …) are not documents the explorer can show.
  let path = resolved.join('/');
  const last = resolved[resolved.length - 1];
  if (target.endsWith('/') || !/\.[a-z0-9]+$/i.test(last)) {
    path = `${path}/index.md`;
  } else if (!/\.(md|markdown)$/i.test(last)) {
    return null;
  }
  return anchor ? { kind: 'doc', path, anchor } : { kind: 'doc', path };
}

/** The document (and anchor) named by a deep link `?doc=<path>#anchor`. */
export function docFromLocation(search: string, hash: string): { path: string | null; anchor?: string } {
  const path = new URLSearchParams(search).get('doc');
  const anchor = hash.startsWith('#') && hash.length > 1 ? decodeURIComponent(hash.slice(1)) : undefined;
  return { path, anchor: path ? anchor : undefined };
}

/** The deep link for a document, e.g. `?doc=oms-knowledge-base%2Fdomain%2Forder.md#fields`. */
export function locationForDoc(path: string, anchor?: string): string {
  return `?${new URLSearchParams({ doc: path })}${anchor ? `#${anchor}` : ''}`;
}

/** GitHub-style heading anchor: lower case, punctuation removed, spaces become hyphens. */
export function slugify(heading: string): string {
  return heading.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
}

/** Classifies an OKF `sources[].resource` for display. */
export function classifySource(currentPath: string, resource: string): Source {
  if (resource.startsWith('repo:')) return { kind: 'repo', path: resource.slice('repo:'.length) };
  // Only web and mail links become clickable; other schemes (javascript:, data:, …) are shown as text
  if (/^(https?|mailto):/i.test(resource)) return { kind: 'url', href: resource };
  if (SCHEME.test(resource)) return { kind: 'text', value: resource };
  if (/\s/.test(resource)) return { kind: 'text', value: resource };
  const link = resolveDocLink(currentPath, resource);
  return link?.kind === 'doc' ? { kind: 'doc', path: link.path } : { kind: 'text', value: resource };
}
