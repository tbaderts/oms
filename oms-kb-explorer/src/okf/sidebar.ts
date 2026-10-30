// Sidebar models: the bundle as a folder tree, or concepts grouped by OKF type, both filterable.
import type { DocMeta } from '../types/index.ts';
import { statusBadge } from './status.ts';

export interface Filter {
  statuses: string[]; // status badges: stable, draft, deprecated, unknown
  trust: string[]; // trust tiers: unverified, machine-confirmed, human-reviewed
}

export const NO_FILTER: Filter = { statuses: [], trust: [] };

export interface FolderNode {
  name: string;
  path: string;
  index?: DocMeta; // the folder's own index.md
  folders: FolderNode[];
  docs: DocMeta[];
}

export interface TypeGroup {
  type: string;
  subgroups: { label: string; docs: DocMeta[] }[];
}

/** Structured types first, then the document types, as in okf-conventions.md. */
const TYPE_ORDER = [
  'Capability', 'Requirement', 'Domain Concept', 'Glossary', 'Interface', 'Architecture', 'Component',
  'Decision', 'Specification', 'Concept Paper', 'Diagram', 'Methodology', 'Assessment', 'Strategy', 'Reference',
];
const UNTYPED = 'Untyped';
const MATURITY_ORDER = ['implemented', 'partial', 'planned'];

const isConcept = (doc: DocMeta) => doc.concept !== false;
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

export function displayTitle(doc: DocMeta): string {
  return doc.okf?.title || doc.name;
}

export function trustOf(doc: DocMeta): string {
  return doc.okf?.trustTier || 'unverified';
}

export function matches(doc: DocMeta, filter: Filter): boolean {
  if (filter.statuses.length && !filter.statuses.includes(statusBadge(doc.status))) return false;
  if (filter.trust.length && !filter.trust.includes(trustOf(doc))) return false;
  return true;
}

const isFiltering = (filter: Filter) => filter.statuses.length > 0 || filter.trust.length > 0;

/**
 * Nests documents by every folder below the bundle root. A folder's index.md is the folder's own
 * entry; root navigation files stay root documents. With a filter, only matching concepts remain
 * and folders left empty are dropped (navigation files are then hidden).
 */
export function folderTree(docs: DocMeta[], filter: Filter): FolderNode {
  const base = docs[0]?.path.split('/')[0] ?? '';
  const root: FolderNode = { name: base, path: base, folders: [], docs: [] };
  const filtering = isFiltering(filter);

  for (const doc of docs) {
    if (filtering && (!isConcept(doc) || !matches(doc, filter))) continue;
    const parts = doc.path.split('/');
    let node = root;
    for (let i = 1; i < parts.length - 1; i++) {
      let child = node.folders.find((f) => f.name === parts[i]);
      if (!child) {
        child = { name: parts[i], path: parts.slice(0, i + 1).join('/'), folders: [], docs: [] };
        node.folders.push(child);
      }
      node = child;
    }
    if (doc.name === 'index.md') node.index = doc;
    else node.docs.push(doc);
  }
  return sortTree(root);
}

function sortTree(node: FolderNode): FolderNode {
  node.folders.sort(byName).forEach(sortTree);
  node.docs.sort((a, b) => displayTitle(a).localeCompare(displayTitle(b)));
  return node;
}

/** The label of a tree entry: requirements lead with their id. */
export function entryLabel(doc: DocMeta): string {
  return doc.okf?.id ? `${doc.okf.id} ${displayTitle(doc)}` : displayTitle(doc);
}

/** Every current document is unverified, so the tree marks only the reviewed ones. */
export function showTrustInTree(doc: DocMeta): boolean {
  return trustOf(doc) !== 'unverified';
}

/** The OKF types present in the knowledge base, sorted, for the search type filter. */
export function typesPresent(docs: DocMeta[]): string[] {
  return [...new Set(docs.map((d) => d.okf?.type).filter((t): t is string => !!t))].sort();
}

/** Concepts grouped by OKF type; capabilities by maturity, requirements FR / NFR in id order. */
export function typeGroups(docs: DocMeta[], filter: Filter): TypeGroup[] {
  const byType = new Map<string, DocMeta[]>();
  for (const doc of docs) {
    if (!isConcept(doc) || !matches(doc, filter)) continue;
    const type = doc.okf?.type || UNTYPED;
    byType.set(type, [...(byType.get(type) ?? []), doc]);
  }
  const rank = (t: string) => (t === UNTYPED ? 1e6 : TYPE_ORDER.indexOf(t) >= 0 ? TYPE_ORDER.indexOf(t) : 1e3);
  const types = [...byType.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  return types.map((type) => ({ type, subgroups: subgroups(type, byType.get(type)!) }));
}

function subgroups(type: string, docs: DocMeta[]): TypeGroup['subgroups'] {
  const byTitle = [...docs].sort((a, b) => displayTitle(a).localeCompare(displayTitle(b)));
  if (type === 'Capability') {
    const labels = [...new Set(docs.map((d) => d.okf?.maturity || 'unspecified'))]
      .sort((a, b) => ((MATURITY_ORDER.indexOf(a) + 1) || 99) - ((MATURITY_ORDER.indexOf(b) + 1) || 99));
    return labels.map((label) => ({ label, docs: byTitle.filter((d) => (d.okf?.maturity || 'unspecified') === label) }));
  }
  if (type === 'Requirement') {
    const byId = [...docs].sort((a, b) => (a.okf?.id ?? '').localeCompare(b.okf?.id ?? ''));
    return [
      { label: 'Functional', docs: byId.filter((d) => !(d.okf?.id ?? '').startsWith('NFR')) },
      { label: 'Non-functional', docs: byId.filter((d) => (d.okf?.id ?? '').startsWith('NFR')) },
    ].filter((g) => g.docs.length > 0);
  }
  return [{ label: type, docs: byTitle }];
}
