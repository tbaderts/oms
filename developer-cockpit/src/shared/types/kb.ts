export interface KbDocument {
  path: string;
  relativePath: string;
  title: string;
  category: string;
  content: string;
  frontmatter: Record<string, unknown>;
  lastModified: number;
}

export interface KbCategory {
  name: string;
  path: string;
  documentCount: number;
  subcategories: KbCategory[];
}

export interface KbSearchResult {
  document: KbDocument;
  score: number;
  matches: string[];
}
