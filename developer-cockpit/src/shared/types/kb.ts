export interface KbDocument {
  path: string;
  relativePath: string;
  title: string;
  /** Top-level section of the knowledge base (`root` for files at the bundle root). */
  category: string;
  /** The folder that holds it, relative to the knowledge base, `/`-separated (`root` at the bundle root). */
  folder: string;
  content: string;
  frontmatter: Record<string, unknown>;
  lastModified: number;
}

/** A folder of the knowledge base; nested to any depth (SPEC-0061). */
export interface KbCategory {
  /** Folder path relative to the knowledge base (`domain/model`), or `root`; pass it to getDocuments. */
  id: string;
  /** Last path segment, shown in the tree. */
  name: string;
  path: string;
  /** Documents in this folder and below, navigation files (index.md, log.md) not counted. */
  documentCount: number;
  subcategories: KbCategory[];
}

export interface KbSearchResult {
  document: KbDocument;
  score: number;
  matches: string[];
}
