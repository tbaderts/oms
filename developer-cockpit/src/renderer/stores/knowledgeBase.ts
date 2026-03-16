import { create } from 'zustand';
import type { KbDocument, KbCategory, KbSearchResult } from '@shared/types/kb';

interface KnowledgeBaseState {
  categories: KbCategory[];
  documents: KbDocument[];
  selectedDocument: KbDocument | null;
  searchResults: KbSearchResult[];
  searchQuery: string;
  loading: boolean;

  loadCategories: () => Promise<void>;
  loadDocuments: (category: string) => Promise<void>;
  selectDocument: (path: string) => Promise<void>;
  search: (query: string) => Promise<void>;
  clearSearch: () => void;
}

export const useKnowledgeBaseStore = create<KnowledgeBaseState>((set) => ({
  categories: [],
  documents: [],
  selectedDocument: null,
  searchResults: [],
  searchQuery: '',
  loading: false,

  loadCategories: async () => {
    set({ loading: true });
    try {
      const categories = await window.cockpit.kb.getCategories();
      set({ categories, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  loadDocuments: async (category: string) => {
    set({ loading: true });
    try {
      const documents = await window.cockpit.kb.getDocuments(category);
      set({ documents, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  selectDocument: async (path: string) => {
    set({ loading: true });
    try {
      const doc = await window.cockpit.kb.getDocument(path);
      set({ selectedDocument: doc, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  search: async (query: string) => {
    set({ searchQuery: query });
    if (!query.trim()) {
      set({ searchResults: [] });
      return;
    }
    try {
      const searchResults = await window.cockpit.kb.search(query);
      set({ searchResults });
    } catch {
      set({ searchResults: [] });
    }
  },

  clearSearch: () => set({ searchQuery: '', searchResults: [] }),
}));
