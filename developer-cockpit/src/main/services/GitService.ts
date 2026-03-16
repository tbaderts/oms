import simpleGit, { type SimpleGit, type StatusResult, type LogResult } from 'simple-git';
import type {
  GitStatus,
  GitStatusFile,
  GitFileStatus,
  GitLogEntry,
  GitDiff,
  GitDiffFile,
  GitBranch,
  GitBranchResult,
} from '../../shared/types/git';

export class GitService {
  private git: SimpleGit;

  constructor(
    private workspaceRoot: string,
    private defaultBranch: string,
  ) {
    this.git = simpleGit(workspaceRoot);
  }

  async getStatus(): Promise<GitStatus> {
    try {
      const status: StatusResult = await this.git.status();

      let detached = false;
      let branch = status.current || '';
      try {
        const headRef = await this.git.revparse(['--abbrev-ref', 'HEAD']);
        if (headRef.trim() === 'HEAD') {
          detached = true;
          const shortSha = await this.git.revparse(['--short', 'HEAD']);
          branch = shortSha.trim();
        }
      } catch {
        // ignore
      }

      return {
        branch,
        tracking: status.tracking || null,
        ahead: status.ahead,
        behind: status.behind,
        clean: status.isClean(),
        detached,
        staged: status.staged.map((f) => this.toStatusFile(f, status)),
        unstaged: status.modified
          .filter((f) => !status.staged.includes(f))
          .map((f) => ({ path: f, status: 'M' as GitFileStatus })),
        untracked: status.not_added.map((f) => ({ path: f, status: '?' as GitFileStatus })),
        conflicted: status.conflicted.map((f) => ({ path: f, status: 'U' as GitFileStatus })),
      };
    } catch (err) {
      return {
        branch: 'unknown',
        tracking: null,
        ahead: 0,
        behind: 0,
        clean: true,
        detached: false,
        staged: [],
        unstaged: [],
        untracked: [],
        conflicted: [],
      };
    }
  }

  private toStatusFile(filePath: string, status: StatusResult): GitStatusFile {
    if (status.created.includes(filePath)) return { path: filePath, status: 'A' };
    if (status.deleted.includes(filePath)) return { path: filePath, status: 'D' };
    if (status.renamed.some((r) => r.to === filePath)) {
      const renamed = status.renamed.find((r) => r.to === filePath);
      return { path: filePath, status: 'R', originalPath: renamed?.from };
    }
    return { path: filePath, status: 'M' };
  }

  async getLog(limit = 50): Promise<GitLogEntry[]> {
    try {
      const log: LogResult = await this.git.log({ maxCount: limit, '--decorate': 'short' });
      return log.all.map((entry) => ({
        hash: entry.hash,
        author: entry.author_name,
        date: entry.date,
        message: entry.message,
        refs: entry.refs,
      }));
    } catch {
      return [];
    }
  }

  async getDiff(ref?: string): Promise<GitDiff> {
    try {
      let raw: string;
      if (ref) {
        raw = await this.git.diff([`${ref}~1`, ref]);
      } else {
        raw = await this.git.diff();
        const stagedDiff = await this.git.diff(['--cached']);
        if (stagedDiff) {
          raw = raw ? `${stagedDiff}\n${raw}` : stagedDiff;
        }
      }

      const files = this.parseDiffFiles(raw);
      return { raw, files };
    } catch {
      return { raw: '', files: [] };
    }
  }

  async getFileDiff(filePath: string): Promise<string> {
    try {
      const diff = await this.git.diff([filePath]);
      if (diff) return diff;
      const staged = await this.git.diff(['--cached', filePath]);
      return staged || '';
    } catch {
      return '';
    }
  }

  async getBranches(): Promise<GitBranch[]> {
    try {
      const branchSummary = await this.git.branch(['-a', '--no-color']);
      const branches: GitBranch[] = [];

      for (const [name, data] of Object.entries(branchSummary.branches)) {
        const isRemote = name.startsWith('remotes/');
        const displayName = isRemote ? name.replace('remotes/', '') : name;

        // Skip HEAD pointers
        if (displayName.includes('HEAD')) continue;

        let merged = false;
        if (!data.current && !isRemote) {
          try {
            const mergedBranches = await this.git.branch(['--merged', this.defaultBranch]);
            merged = mergedBranches.all.includes(name);
          } catch {
            // ignore
          }
        }

        let aheadDefault = 0;
        let behindDefault = 0;
        if (data.current && !isRemote) {
          try {
            const revList = await this.git.raw([
              'rev-list',
              '--left-right',
              '--count',
              `${this.defaultBranch}...${name}`,
            ]);
            const [behind, ahead] = revList.trim().split(/\s+/).map(Number);
            aheadDefault = ahead || 0;
            behindDefault = behind || 0;
          } catch {
            // ignore
          }
        }

        branches.push({
          name: displayName,
          current: data.current,
          remote: isRemote,
          tracking: null,
          lastCommit: data.commit,
          lastCommitDate: data.label || '',
          aheadDefault,
          behindDefault,
          merged,
        });
      }

      return branches;
    } catch {
      return [];
    }
  }

  async createBranch(name: string): Promise<GitBranchResult> {
    try {
      if (!this.isValidBranchName(name)) {
        return { success: false, message: `Invalid branch name: ${name}` };
      }
      await this.git.checkoutLocalBranch(name);
      return { success: true, message: `Created and switched to branch '${name}'` };
    } catch (err) {
      return { success: false, message: this.errorMessage(err) };
    }
  }

  async checkoutBranch(name: string): Promise<GitBranchResult> {
    try {
      const status = await this.git.status();
      if (!status.isClean()) {
        return {
          success: false,
          message: 'Working directory is not clean. Commit or stash changes before switching branches.',
        };
      }
      await this.git.checkout(name);
      return { success: true, message: `Switched to branch '${name}'` };
    } catch (err) {
      return { success: false, message: this.errorMessage(err) };
    }
  }

  async deleteBranch(name: string, force = false): Promise<GitBranchResult> {
    try {
      const branchSummary = await this.git.branch();
      if (branchSummary.current === name) {
        return { success: false, message: 'Cannot delete the currently checked out branch.' };
      }
      if (name === this.defaultBranch) {
        return { success: false, message: `Cannot delete the default branch '${this.defaultBranch}'.` };
      }

      if (force) {
        await this.git.branch(['-D', name]);
      } else {
        await this.git.branch(['-d', name]);
      }
      return { success: true, message: `Deleted branch '${name}'` };
    } catch (err) {
      return { success: false, message: this.errorMessage(err) };
    }
  }

  private isValidBranchName(name: string): boolean {
    if (!name || name.trim() !== name) return false;
    if (/[\s~^:?*\[\\]/.test(name)) return false;
    if (name.startsWith('-') || name.startsWith('.')) return false;
    if (name.endsWith('.') || name.endsWith('.lock') || name.endsWith('/')) return false;
    if (name.includes('..') || name.includes('@{')) return false;
    return true;
  }

  private parseDiffFiles(raw: string): GitDiffFile[] {
    const files: GitDiffFile[] = [];
    const diffBlocks = raw.split(/^diff --git /m).filter(Boolean);

    for (const block of diffBlocks) {
      const pathMatch = block.match(/^a\/(.+?) b\//);
      if (!pathMatch) continue;

      let additions = 0;
      let deletions = 0;
      const lines = block.split('\n');
      for (const line of lines) {
        if (line.startsWith('+') && !line.startsWith('+++')) additions++;
        if (line.startsWith('-') && !line.startsWith('---')) deletions++;
      }

      files.push({ path: pathMatch[1], additions, deletions });
    }

    return files;
  }

  private errorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
  }
}
