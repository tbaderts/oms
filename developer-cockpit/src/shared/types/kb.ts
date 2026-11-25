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

/** A finding of the knowledge base checker (`tools/okf-check`), file relative to the bundle (SPEC-0064). */
export interface KbFinding {
  file: string;
  rule: string;
  message: string;
}

/** The checker's statistics over the documents (index.md and log.md not counted). */
export interface KbStats {
  documents: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  /** Top-level folder, `root` for the bundle root. */
  byFolder: Record<string, number>;
  requirements: { total: number; byImplementation: Record<string, number>; byPriority: Record<string, number> };
  /** Archived documents left out; `due` means older than reviewAfterDays (null: no review period set). */
  reviewAge: { reviewAfterDays: number | null; current: number; due: number; unknown: number };
  /** Whether git could date the `repo:` sources for the drift warning. */
  drift: 'checked' | 'unavailable';
}

/** `okf-check <bundle> --json`: errors fail the check, warnings ask for a review. */
export interface KbHealthReport {
  concepts: number;
  errors: KbFinding[];
  warnings: KbFinding[];
  stats: KbStats;
}

/** Entries the index fix adds to one folder index (bundle-relative path). */
export interface KbIndexChange {
  index: string;
  created: boolean;
  documents: string[];
  sections: string[];
}

/** `okf-check <bundle> --fix-indexes --json`; `applied` is false for a dry run. */
export interface KbIndexFixResult {
  applied: boolean;
  changes: KbIndexChange[];
}
