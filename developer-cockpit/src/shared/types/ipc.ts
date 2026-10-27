import type { CockpitConfig } from './config';
import type {
  ApiResponse,
  CommandCatalog,
  HistoryEntry,
  OrderFollowUp,
  Paging,
  QueryParam,
  SaveTemplateRequest,
  SaveTemplateResult,
  TemplateSource,
} from '../apiExplorer';
import type { KbDocument, KbCategory, KbSearchResult } from './kb';
import type { FsEntry, FsStat } from './fs';
import type { UseCase, FunctionalRequirement, NonFunctionalRequirement, Actor } from './requirements';
import type { GitStatus, GitLogEntry, GitDiff, GitBranch, GitBranchResult } from './git';
import type { SpecFile, SpecValidationResult, CodeGenTask, CodeGenResult, DomainEntity } from './specs';
import type {
  SpecAction,
  SpecActionResult,
  SpecDocument,
  SpecGateResult,
  SpecSaveResult,
  SpecTicketDetail,
  SpecTicketList,
} from './specTickets';

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

  // Spec workflow tickets (specs/changes, specs/archive), backed by specs/tools/spec.mjs
  specTickets: {
    list(includeArchived: boolean): Promise<SpecTicketList>;
    get(id: string): Promise<SpecTicketDetail>;
    run(action: SpecAction): Promise<SpecActionResult>;
    /** Saves the current stage's document; `conflict` if the file no longer equals `baseContent` (unless `force`). */
    saveDocument(id: string, doc: SpecDocument, content: string, baseContent: string, force: boolean): Promise<SpecSaveResult>;
    /** The current stage's gate as if `doc` had `content`; writes nothing. */
    draftGate(id: string, doc: SpecDocument, content: string): Promise<SpecGateResult>;
    toggleTask(id: string, taskId: string, done: boolean, baseContent: string, force: boolean): Promise<SpecSaveResult>;
  };

  // API Explorer: calls oms-core from the main process (SPEC-0007)
  apiExplorer: {
    catalog(): Promise<CommandCatalog>;
    baseUrl(): Promise<{ baseUrl: string; local: boolean }>;
    /** A non-local oms-core needs `confirmedHost` equal to its host name. */
    sendCommand(bodyText: string, confirmedHost?: string): Promise<ApiResponse>;
    search(params: QueryParam[], paging: Paging): Promise<ApiResponse>;
    followUp(orderId: string): Promise<OrderFollowUp>;
    history(): Promise<HistoryEntry[]>;
    clearHistory(): Promise<void>;
    /** The `.http` template files (SPEC-0008). */
    templates(): Promise<TemplateSource[]>;
    /** Appends a template to a listed source, or creates a new file in the shared folder. */
    saveTemplate(req: SaveTemplateRequest): Promise<SaveTemplateResult>;
  };

  // Events
  events: {
    getWebSocketUrl(): Promise<string>;
  };
}
