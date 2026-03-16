import { create } from 'zustand';
import type { GitStatus, GitLogEntry, GitBranch, GitDiff } from '@shared/types/git';

interface GitState {
  status: GitStatus | null;
  log: GitLogEntry[];
  branches: GitBranch[];
  selectedCommit: GitLogEntry | null;
  selectedFile: string | null;
  currentDiff: GitDiff | null;
  fileDiff: string | null;
  error: string | null;
  loading: boolean;

  refreshStatus: () => Promise<void>;
  refreshLog: (limit?: number) => Promise<void>;
  refreshBranches: () => Promise<void>;
  refreshAll: () => Promise<void>;
  selectCommit: (entry: GitLogEntry) => Promise<void>;
  selectFile: (path: string) => Promise<void>;
  clearSelection: () => void;
  createBranch: (name: string) => Promise<{ success: boolean; message: string }>;
  checkoutBranch: (name: string) => Promise<{ success: boolean; message: string }>;
  deleteBranch: (name: string, force?: boolean) => Promise<{ success: boolean; message: string }>;
}

export const useGitStore = create<GitState>((set, get) => ({
  status: null,
  log: [],
  branches: [],
  selectedCommit: null,
  selectedFile: null,
  currentDiff: null,
  fileDiff: null,
  error: null,
  loading: false,

  refreshStatus: async () => {
    try {
      const status = await window.cockpit.git.getStatus();
      set({ status, error: null });
    } catch {
      set({ error: 'Failed to load git status' });
    }
  },

  refreshLog: async (limit?: number) => {
    try {
      const log = await window.cockpit.git.getLog(limit);
      set({ log, error: null });
    } catch {
      set({ error: 'Failed to load git log' });
    }
  },

  refreshBranches: async () => {
    try {
      const branches = await window.cockpit.git.getBranches();
      set({ branches, error: null });
    } catch {
      set({ error: 'Failed to load branches' });
    }
  },

  refreshAll: async () => {
    set({ loading: true });
    try {
      const [status, log, branches] = await Promise.all([
        window.cockpit.git.getStatus(),
        window.cockpit.git.getLog(),
        window.cockpit.git.getBranches(),
      ]);
      set({ status, log, branches, error: null, loading: false });
    } catch {
      set({ error: 'Failed to refresh git data', loading: false });
    }
  },

  selectCommit: async (entry: GitLogEntry) => {
    set({ selectedCommit: entry, selectedFile: null, fileDiff: null });
    try {
      const currentDiff = await window.cockpit.git.getDiff(entry.hash);
      set({ currentDiff, error: null });
    } catch {
      set({ currentDiff: null, error: 'Failed to load commit diff' });
    }
  },

  selectFile: async (path: string) => {
    set({ selectedFile: path, selectedCommit: null, currentDiff: null });
    try {
      const fileDiff = await window.cockpit.git.getFileDiff(path);
      set({ fileDiff, error: null });
    } catch {
      set({ fileDiff: null, error: 'Failed to load file diff' });
    }
  },

  clearSelection: () => {
    set({ selectedCommit: null, selectedFile: null, currentDiff: null, fileDiff: null });
  },

  createBranch: async (name: string) => {
    const result = await window.cockpit.git.createBranch(name);
    if (result.success) {
      await get().refreshAll();
    }
    return result;
  },

  checkoutBranch: async (name: string) => {
    const result = await window.cockpit.git.checkoutBranch(name);
    if (result.success) {
      await get().refreshAll();
    }
    return result;
  },

  deleteBranch: async (name: string, force?: boolean) => {
    const result = await window.cockpit.git.deleteBranch(name, force);
    if (result.success) {
      await get().refreshAll();
    }
    return result;
  },
}));
