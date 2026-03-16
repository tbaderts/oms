import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import Fuse from 'fuse.js';
import type { KbDocument, KbCategory, KbSearchResult } from '../../shared/types/kb';

export class KbService {
  private documents: KbDocument[] = [];
  private fuse: Fuse<KbDocument> | null = null;

  constructor(private kbPath: string) {}

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
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await this.scanDirectory(fullPath, relPath);
        }
      } else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
        try {
          const raw = fs.readFileSync(fullPath, 'utf-8');
          const { data: frontmatter, content } = matter(raw);
          const stat = fs.statSync(fullPath);
          const category = relativeTo.split('/')[0] || 'root';
          const title = (frontmatter.title as string) || this.titleFromFilename(entry.name);

          this.documents.push({
            path: fullPath,
            relativePath: relPath,
            title,
            category,
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

  getCategories(): KbCategory[] {
    const categoryMap = new Map<string, { docs: number; subcats: Map<string, number> }>();

    for (const doc of this.documents) {
      const parts = doc.relativePath.split('/');
      const topCategory = parts[0] || 'root';

      if (!categoryMap.has(topCategory)) {
        categoryMap.set(topCategory, { docs: 0, subcats: new Map() });
      }
      const cat = categoryMap.get(topCategory)!;
      cat.docs++;

      if (parts.length > 2) {
        const subcat = parts[1];
        cat.subcats.set(subcat, (cat.subcats.get(subcat) || 0) + 1);
      }
    }

    return Array.from(categoryMap.entries()).map(([name, data]) => ({
      name,
      path: path.join(this.kbPath, name),
      documentCount: data.docs,
      subcategories: Array.from(data.subcats.entries()).map(([subName, count]) => ({
        name: subName,
        path: path.join(this.kbPath, name, subName),
        documentCount: count,
        subcategories: [],
      })),
    }));
  }

  getDocuments(category: string): KbDocument[] {
    return this.documents.filter((d) => d.category === category);
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
