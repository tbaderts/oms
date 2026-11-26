import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import Fuse from 'fuse.js';
import type { KbDocument, KbCategory, KbSearchResult, KbTreeEntry, KbTypeGroup } from '../../shared/types/kb';

export class KbService {
  private documents: KbDocument[] = [];
  private fuse: Fuse<KbDocument> | null = null;

  constructor(private kbPath: string) {}

  /** The path this service scans, for callers that rebuild it on a config change. */
  get searchPath(): string {
    return this.kbPath;
  }

  async scan(): Promise<void> {
    this.documents = [];
    await this.scanDirectory(this.kbPath, '');
    this.fuse = new Fuse(this.documents, {
      keys: [
        { name: 'title', weight: 2 },
        { name: 'content', weight: 1 },
        { name: 'category', weight: 1.5 },
      ],
      includeScore: true,
      includeMatches: true,
      threshold: 0.4,
      minMatchCharLength: 2,
    });
  }

  private async scanDirectory(dirPath: string, relativeTo: string): Promise<void> {
    if (!fs.existsSync(dirPath)) return;

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relPath = relativeTo ? `${relativeTo}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        // storyboards/ at the bundle root is outside the OKF bundle and has its own view (SPEC-0014).
        const isStoryboards = relPath === 'storyboards';
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules' && !isStoryboards) {
          await this.scanDirectory(fullPath, relPath);
        }
      } else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
        try {
          const raw = fs.readFileSync(fullPath, 'utf-8');
          const { data: frontmatter, content } = matter(raw);
          const stat = fs.statSync(fullPath);
          const category = relativeTo.split('/')[0] || 'root';
          const folder = relativeTo || 'root';
          const title = (frontmatter.title as string) || this.titleFromFilename(entry.name);

          this.documents.push({
            path: fullPath,
            relativePath: relPath,
            title,
            category,
            folder,
            content,
            frontmatter,
            lastModified: stat.mtimeMs,
          });
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  private titleFromFilename(filename: string): string {
    return filename
      .replace(/\.(md|mdx)$/, '')
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /**
   * The folder tree of the knowledge base, nested to any depth, sorted by name with `root` (the files
   * at the bundle root) last. Navigation files (index.md, log.md) are not counted (SPEC-0061).
   */
  getCategories(): KbCategory[] {
    const root: KbCategory[] = [];
    const nodes = new Map<string, KbCategory>();
    const node = (id: string): KbCategory => {
      let n = nodes.get(id);
      if (n) return n;
      const parts = id.split('/');
      n = { id, name: parts[parts.length - 1], path: path.join(this.kbPath, ...(id === 'root' ? [] : parts)), documentCount: 0, subcategories: [] };
      nodes.set(id, n);
      if (parts.length === 1) root.push(n);
      else node(parts.slice(0, -1).join('/')).subcategories.push(n);
      return n;
    };
    for (const doc of this.documents) {
      node(doc.folder); // a folder appears even when it holds only its index.md
      if (isNavigation(doc)) continue;
      // count the document in its folder and every folder above it
      const parts = doc.folder === 'root' ? ['root'] : doc.folder.split('/');
      for (let i = 1; i <= parts.length; i++) node(parts.slice(0, i).join('/')).documentCount++;
    }
    const sort = (list: KbCategory[]) => {
      list.sort((x, y) => (x.id === 'root' ? 1 : y.id === 'root' ? -1 : x.name.localeCompare(y.name)));
      list.forEach((c) => sort(c.subcategories));
      return list;
    };
    return sort(root);
  }

  /** The documents directly in one folder (a category id such as `domain/model`, or `root`), navigation files left out. */
  getDocuments(folder: string): KbDocument[] {
    return this.documents
      .filter((d) => d.folder === folder && !isNavigation(d))
      .sort((x, y) => x.title.localeCompare(y.title));
  }

  /**
   * Every document grouped by its OKF `type`, as in the OKF knowledge base explorer's type view: the structured
   * types first in the conventions' order, other types by name, untyped documents last. Navigation
   * files (index.md, log.md) are left out.
   */
  getTypeGroups(): KbTypeGroup[] {
    const byType = new Map<string, KbDocument[]>();
    for (const doc of this.documents) {
      if (isNavigation(doc)) continue;
      const type = stringField(doc, 'type') ?? UNTYPED;
      byType.set(type, [...(byType.get(type) ?? []), doc]);
    }
    const rank = (t: string) => (t === UNTYPED ? 1e6 : TYPE_ORDER.includes(t) ? TYPE_ORDER.indexOf(t) : 1e3);
    return [...byType.keys()]
      .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
      .map((type) => {
        const docs = byType.get(type)!;
        return { type, count: docs.length, subgroups: typeSubgroups(type, docs) };
      });
  }

  getDocument(docPath: string): KbDocument | undefined {
    return this.documents.find((d) => d.path === docPath || d.relativePath === docPath);
  }

  search(query: string): KbSearchResult[] {
    if (!this.fuse || !query.trim()) return [];
    const results = this.fuse.search(query, { limit: 20 });
    return results.map((r) => ({
      document: r.item,
      score: r.score ?? 1,
      matches: r.matches?.map((m) => m.value ?? '') ?? [],
    }));
  }
}

/** index.md and log.md are navigation (OKF reserved files), not documents to list. */
/**
 * Structured types first, then the document types, as in okf-conventions.md and the OKF knowledge base explorer;
 * use cases and actors follow requirements, patterns follow architecture.
 */
const TYPE_ORDER = [
  'Capability', 'Requirement', 'Use Case', 'Actor', 'Domain Concept', 'Glossary', 'Interface', 'Architecture',
  'Pattern', 'Component', 'Decision', 'Specification', 'Concept Paper', 'Diagram', 'Methodology', 'Assessment',
  'Strategy', 'Reference',
];
const UNTYPED = 'Untyped';
const MATURITY_ORDER = ['implemented', 'partial', 'planned'];

function stringField(doc: KbDocument, key: string): string | undefined {
  const value = doc.frontmatter?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function treeEntry(doc: KbDocument): KbTreeEntry {
  const id = stringField(doc, 'id');
  const status = stringField(doc, 'status');
  return {
    path: doc.path,
    relativePath: doc.relativePath,
    label: id ? `${id} ${doc.title}` : doc.title,
    ...(status ? { status } : {}),
  };
}

/** Capabilities by maturity, requirements functional / non-functional in id order, others by title. */
function typeSubgroups(type: string, docs: KbDocument[]): KbTypeGroup['subgroups'] {
  const entries = (list: KbDocument[]) => list.map(treeEntry);
  const byTitle = [...docs].sort((a, b) => a.title.localeCompare(b.title));
  if (type === 'Capability') {
    const maturity = (d: KbDocument) => stringField(d, 'maturity') ?? 'unspecified';
    const rank = (m: string) => (MATURITY_ORDER.indexOf(m) + 1) || 99;
    return [...new Set(docs.map(maturity))]
      .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
      .map((label) => ({ label, documents: entries(byTitle.filter((d) => maturity(d) === label)) }));
  }
  if (type === 'Requirement') {
    const id = (d: KbDocument) => stringField(d, 'id') ?? '';
    const byId = [...docs].sort((a, b) => id(a).localeCompare(id(b)));
    return [
      { label: 'Functional', documents: entries(byId.filter((d) => !id(d).startsWith('NFR'))) },
      { label: 'Non-functional', documents: entries(byId.filter((d) => id(d).startsWith('NFR'))) },
    ].filter((g) => g.documents.length > 0);
  }
  return [{ label: type, documents: entries(byTitle) }];
}

function isNavigation(doc: KbDocument): boolean {
  const name = doc.relativePath.split('/').pop();
  return name === 'index.md' || name === 'log.md';
}
