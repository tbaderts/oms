// Search helpers: OKF facets for result rows and the query parameters sent to /api/kb/search.
import type { DocMeta } from '../types/index.ts';
import { displayTitle, trustOf } from './sidebar.ts';

export interface SearchFilters {
  type?: string;
  tag?: string;
}

export interface Facets {
  title?: string;
  type?: string;
  status?: string;
  trustTier?: string;
}

/**
 * Adds the document's title, type, status and trust tier to each hit; for paths not in the document
 * list only a title (the file name without `.md`).
 */
export function decorateHits<T extends { path: string }>(hits: T[], docs: DocMeta[]): (T & Facets)[] {
  const byPath = new Map(docs.map((d) => [d.path, d]));
  return hits.map((hit) => {
    const doc = byPath.get(hit.path);
    if (!doc) {
      const title = (hit.path.split('/').pop() ?? hit.path).replace(/\.md$/, '');
      return { ...hit, title, type: undefined, status: undefined, trustTier: undefined };
    }
    return {
      ...hit,
      title: displayTitle(doc),
      type: doc.okf?.type ?? undefined,
      status: doc.status ?? undefined,
      trustTier: trustOf(doc),
    };
  });
}

export function searchParams(query: string, topK: number, filters: SearchFilters = {}): URLSearchParams {
  const params = new URLSearchParams({ query, topK: topK.toString() });
  if (filters.type?.trim()) params.set('filterType', filters.type.trim());
  if (filters.tag?.trim()) params.set('filterTag', filters.tag.trim());
  return params;
}
