import type { CockpitConfig } from './config';
import type { KbDocument, KbCategory, KbSearchResult } from './kb';
import type { FsEntry, FsStat } from './fs';
import type { UseCase, FunctionalRequirement, NonFunctionalRequirement, Actor } from './requirements';
import type { GitStatus, GitLogEntry, GitDiff, GitBranch, GitBranchResult } from './git';
import type { SpecFile, SpecValidationResult, CodeGenTask, CodeGenResult, DomainEntity } from './specs';

export interface CockpitAPI {
  // Config
  config: {
    load(): Promise<CockpitConfig>;
    save(config: CockpitConfig): Promise<void>;
    getWorkspaceRoot(): Promise<string>;
  };

  // Knowledge Base
  kb: {
    getCategories(): Promise<KbCategory[]>;
    getDocuments(category: string): Promise<KbDocument[]>;
    getDocument(path: string): Promise<KbDocument>;
    search(query: string): Promise<KbSearchResult[]>;
  };

  // File System
  fs: {
    readDir(path: string): Promise<FsEntry[]>;
    readFile(path: string): Promise<string>;
    stat(path: string): Promise<FsStat>;
  };

  // Requirements
  requirements: {
    getUseCases(): Promise<UseCase[]>;
    getFunctionalRequirements(): Promise<FunctionalRequirement[]>;
    getNonFunctionalRequirements(): Promise<NonFunctionalRequirement[]>;
    getActors(): Promise<Actor[]>;
  };

  // Shell
  shell: {
    openExternal(url: string): Promise<void>;
    showItemInFolder(path: string): Promise<void>;
    getAppVersion(): Promise<string>;
    getPlatform(): Promise<string>;
  };

  // Git
  git: {
    getStatus(): Promise<GitStatus>;
    getLog(limit?: number): Promise<GitLogEntry[]>;
    getDiff(ref?: string): Promise<GitDiff>;
    getFileDiff(path: string): Promise<string>;
    getBranches(): Promise<GitBranch[]>;
    createBranch(name: string): Promise<GitBranchResult>;
    checkoutBranch(name: string): Promise<GitBranchResult>;
    deleteBranch(name: string, force?: boolean): Promise<GitBranchResult>;
  };

  // Specs
  specs: {
    discoverFiles(): Promise<SpecFile[]>;
    readFile(path: string): Promise<string>;
    writeFile(path: string, content: string): Promise<void>;
    validate(path: string, content: string): Promise<SpecValidationResult>;
    getCodeGenTasks(): Promise<CodeGenTask[]>;
    runCodeGen(taskId: string): Promise<CodeGenResult>;
    parseEntities(): Promise<DomainEntity[]>;
  };

  // Events
  events: {
    getWebSocketUrl(): Promise<string>;
  };
}
