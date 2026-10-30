// The metadata block shown above a document's body.
import type { DocMeta } from '../types/index.ts';
import { classifySource, resolveDocLink, type Source } from './links.ts';
import { statusBadge, trustBadge, type StatusBadge, type TrustBadge } from './status.ts';

export interface HeaderKey {
  label: string;
  value: string;
  path?: string; // in-app link target (the capability of a requirement)
}

export interface Header {
  title: string;
  type: string;
  status: StatusBadge;
  trust: TrustBadge | null;
  stale: boolean;
  staleAfter?: string;
  version?: string;
  updated?: string;
  tags: string[];
  description?: string;
  keys: HeaderKey[];
  sources: Source[];
}

/** Null for documents without an OKF type (no front matter): they are shown without a header. */
export function documentHeader(doc: DocMeta | undefined): Header | null {
  const okf = doc?.okf;
  if (!doc || !okf?.type) return null;

  const keys: HeaderKey[] = [];
  const add = (label: string, value?: string | null, path?: string) => {
    if (value) keys.push(path ? { label, value, path } : { label, value });
  };
  add('Maturity', okf.maturity);
  add('Id', okf.id);
  add('Priority', okf.priority);
  add('Implementation', okf.implementation);
  if (okf.capability) {
    const link = resolveDocLink(doc.path, okf.capability);
    add('Capability', okf.capability, link?.kind === 'doc' ? link.path : undefined);
  }

  return {
    title: okf.title || doc.name,
    type: okf.type,
    status: statusBadge(doc.status),
    trust: trustBadge(okf.trustTier),
    stale: okf.stale === true,
    staleAfter: okf.staleAfter ?? undefined,
    version: okf.version ?? undefined,
    updated: okf.updated ?? undefined,
    tags: okf.tags ?? [],
    description: okf.description ?? undefined,
    keys,
    sources: (okf.sources ?? []).map((resource) => classifySource(doc.path, resource)),
  };
}
