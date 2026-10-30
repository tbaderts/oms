// OKF metadata of a document, from its front matter (GET /api/kb/documents → okf)
export interface OkfMetadata {
  type?: string | null;
  title?: string | null;
  description?: string | null;
  tags: string[];
  status?: string | null;
  legacyStatus?: string | null;
  version?: string | null;
  updated?: string | null;
  staleAfter?: string | null;
  stale: boolean;
  trustTier?: string | null;
  maturity?: string | null;
  id?: string | null;
  priority?: string | null;
  implementation?: string | null;
  capability?: string | null;
  sources: string[];
}

// Document metadata from GET /api/kb/documents
export interface DocMeta {
  path: string;
  name: string;
  size: number;
  lastModifiedIso: string;
  version?: string | null;
  // OKF status (draft, stable, deprecated) or, without front matter, the bold-header status
  status?: string | null;
  lastUpdated?: string | null;
  category?: string | null;
  // false for the OKF reserved files index.md and log.md
  concept?: boolean;
  okf?: OkfMetadata | null;
}

// Links of a document, from GET /api/kb/documents/links
export interface DocLinks {
  outgoing: { target: string; exists: boolean }[];
  backlinks: string[];
}

// Document content from MCP readDomainDoc
export interface DocContent {
  path: string;
  content: string;
  totalLength: number;
  from: number;
  to: number;
}

// Search hit from MCP searchDomainDocs
export interface SearchHit {
  path: string;
  score: number;
  snippet: string;
}

// Hybrid search hit from MCP hybridSearchDocs
export interface HybridSearchHit {
  path: string;
  keywordScore: number;
  semanticScore: number;
  hybridScore: number;
  snippet: string;
  matchType: 'keyword' | 'semantic' | 'hybrid' | 'keyword-only';
}

// Section from MCP listDocSections
export interface DocSection {
  title: string;
  level: number;
  lineNumber: number;
}

// Search mode
export type SearchMode = 'keyword' | 'semantic' | 'hybrid';

// Theme mode
export type ThemeMode = 'light' | 'dark';
