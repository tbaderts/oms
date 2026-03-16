export type GitFileStatus = 'M' | 'A' | 'D' | 'R' | 'C' | 'U' | '?' | '!';

export interface GitStatusFile {
  path: string;
  status: GitFileStatus;
  originalPath?: string;
}

export interface GitStatus {
  branch: string;
  tracking: string | null;
  ahead: number;
  behind: number;
  clean: boolean;
  detached: boolean;
  staged: GitStatusFile[];
  unstaged: GitStatusFile[];
  untracked: GitStatusFile[];
  conflicted: GitStatusFile[];
}

export interface GitLogEntry {
  hash: string;
  author: string;
  date: string;
  message: string;
  refs: string;
}

export interface GitBranch {
  name: string;
  current: boolean;
  remote: boolean;
  tracking: string | null;
  lastCommit: string;
  lastCommitDate: string;
  aheadDefault: number;
  behindDefault: number;
  merged: boolean;
}

export interface GitDiffFile {
  path: string;
  additions: number;
  deletions: number;
}

export interface GitDiff {
  raw: string;
  files: GitDiffFile[];
}

export interface GitBranchResult {
  success: boolean;
  message: string;
}
