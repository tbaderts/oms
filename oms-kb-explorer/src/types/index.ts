// Document metadata from MCP listDomainDocs
export interface DocMeta {
  path: string;
  name: string;
  size: number;
  lastModifiedIso: string;
  version?: string;
  status?: string;
  lastUpdated?: string;
  category?: string;
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
