import { create } from 'zustand';
import type { KbDocument, KbCategory, KbSearchResult, KbTypeGroup } from '@shared/types/kb';

/** How the tree browses the knowledge base: by folder, or by OKF type as in the OKF explorer. */
export type KbTreeView = 'folders' | 'types';

interface KnowledgeBaseState {
  categories: KbCategory[];
  documents: KbDocument[];
  selectedDocument: KbDocument | null;
  searchResults: KbSearchResult[];
  searchQuery: string;
  loading: boolean;
  /** Kept here so the choice survives leaving the Knowledge Base tab. */
  treeView: KbTreeView;
  typeGroups: KbTypeGroup[];

  loadCategories: () => Promise<void>;
  loadDocuments: (category: string) => Promise<void>;
  setTreeView: (view: KbTreeView) => void;
  loadTypeGroups: () => Promise<void>;
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
  treeView: 'folders',
  typeGroups: [],

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

  setTreeView: (treeView) => set({ treeView }),

  loadTypeGroups: async () => {
    try {
      set({ typeGroups: await window.cockpit.kb.getTypeGroups() });
    } catch {
      set({ typeGroups: [] });
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
