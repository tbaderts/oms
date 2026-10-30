import type { DocMeta, DocContent, DocLinks, SearchHit, HybridSearchHit, DocSection } from '../types/index.ts';
import { searchParams, type SearchFilters } from '../okf/search.ts';

// Override with VITE_KB_API_URL, e.g. to point at a locally started MCP server on another port
const API_BASE_URL: string =
  (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_KB_API_URL ?? 'http://localhost:8091/api/kb';

export const kbApi = {
  /**
   * List all documents with metadata
   */
  async listDocuments(): Promise<DocMeta[]> {
    const response = await fetch(`${API_BASE_URL}/documents`);
    if (!response.ok) throw new Error('Failed to fetch documents');
    return response.json();
  },

  /**
   * Read document content
   */
  async readDocument(path: string): Promise<DocContent> {
    const params = new URLSearchParams({ path });
    const response = await fetch(`${API_BASE_URL}/documents/read?${params}`);
    if (!response.ok) throw new Error(`Failed to read document: ${path}`);
    return response.json();
  },

  /**
   * Search documents using keyword search
   */
  async searchKeyword(query: string, topK: number = 10, filters: SearchFilters = {}): Promise<SearchHit[]> {
    const response = await fetch(`${API_BASE_URL}/search/keyword?${searchParams(query, topK, filters)}`);
    if (!response.ok) throw new Error('Search failed');
    return response.json();
  },

  /**
   * Search documents using semantic search (AI-powered, meaning-based)
   */
  async searchSemantic(query: string, topK: number = 10, filters: SearchFilters = {}): Promise<HybridSearchHit[]> {
    const response = await fetch(`${API_BASE_URL}/search/semantic?${searchParams(query, topK, filters)}`);
    if (!response.ok) throw new Error('Semantic search failed');
    return response.json();
  },

  /**
   * Search documents using hybrid search (keyword + semantic, rank-fused on the server)
   */
  async searchHybrid(query: string, topK: number = 10, filters: SearchFilters = {}): Promise<HybridSearchHit[]> {
    const response = await fetch(`${API_BASE_URL}/search/hybrid?${searchParams(query, topK, filters)}`);
    if (!response.ok) throw new Error('Hybrid search failed');
    return response.json();
  },

  /**
   * Outgoing links and backlinks ("cited by") of a document
   */
  async getLinks(path: string): Promise<DocLinks> {
    const params = new URLSearchParams({ path });
    const response = await fetch(`${API_BASE_URL}/documents/links?${params}`);
    if (!response.ok) throw new Error(`Failed to load links for: ${path}`);
    return response.json();
  },

  /**
   * List sections/headings in a document
   */
  async listSections(path: string): Promise<DocSection[]> {
    const params = new URLSearchParams({ path });
    const response = await fetch(`${API_BASE_URL}/documents/sections?${params}`);
    if (!response.ok) throw new Error(`Failed to list sections for: ${path}`);
    return response.json();
  },
};

// Mock data for development (remove when API is ready)
export const mockKbApi = {
  async listDocuments(): Promise<DocMeta[]> {
    return [
      {
        path: 'oms-knowledge-base/oms-concepts/order-lifecycle.md',
        name: 'order-lifecycle.md',
        size: 650,
        lastModifiedIso: '2026-02-16T10:00:00Z',
        version: '1.0',
        status: 'Complete',
        category: 'Domain & Business Logic',
      },
      {
        path: 'oms-knowledge-base/oms-framework/testing-patterns.md',
        name: 'testing-patterns.md',
        size: 1400,
        lastModifiedIso: '2026-02-16T09:30:00Z',
        version: '1.0',
        status: 'Complete',
        category: 'Framework & Architecture',
      },
      {
        path: 'oms-knowledge-base/oms-framework/error-handling.md',
        name: 'error-handling.md',
        size: 1400,
        lastModifiedIso: '2026-02-16T09:00:00Z',
        version: '1.0',
        status: 'Complete',
        category: 'Framework & Architecture',
      },
    ];
  },

  async readDocument(path: string): Promise<DocContent> {
    return {
      path,
      content: `# ${path.split('/').pop()}\n\n**Version:** 1.0\n**Status:** Complete\n\n## Overview\n\nThis is a sample document.\n\n## Example Code\n\n\`\`\`java\npublic class Example {\n    public static void main(String[] args) {\n        System.out.println("Hello, KB Explorer!");\n    }\n}\n\`\`\`\n\n## Related Documents\n\n- [Another Document](other-doc.md)`,
      totalLength: 300,
      from: 0,
      to: 300,
    };
  },

  async searchHybrid(): Promise<HybridSearchHit[]> {
    return [
      {
        path: 'oms-knowledge-base/oms-concepts/order-lifecycle.md',
        keywordScore: 0.89,
        semanticScore: 0.98,
        hybridScore: 0.94,
        snippet: `...State Machine Framework provides validation for all order state transitions...`,
        matchType: 'hybrid',
      },
    ];
  },

  async listSections(): Promise<DocSection[]> {
    return [
      { title: 'Overview', level: 2, lineNumber: 5 },
      { title: 'Example Code', level: 2, lineNumber: 10 },
      { title: 'Related Documents', level: 2, lineNumber: 20 },
    ];
  },

  async getLinks(): Promise<DocLinks> {
    return { outgoing: [], backlinks: [] };
  },
};
