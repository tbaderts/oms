export const SPEC_STAGES = ['proposal', 'design', 'plan', 'implement', 'verify', 'done'] as const;
export type SpecStage = (typeof SPEC_STAGES)[number];
export type SpecTicketStatus = SpecStage | 'blocked';

export const SPEC_DOCUMENTS = ['proposal', 'design', 'tasks', 'verification'] as const;
export type SpecDocument = (typeof SPEC_DOCUMENTS)[number];

export const DOCUMENT_FILES: Record<SpecDocument, string> = {
  proposal: 'proposal.md',
  design: 'design.md',
  tasks: 'tasks.md',
  verification: 'verification.md',
};

/** The document each stage works on, as in spec.mjs `DOCS`. */
export const STAGE_DOCUMENT: Partial<Record<SpecStage, SpecDocument>> = {
  proposal: 'proposal',
  design: 'design',
  plan: 'tasks',
  implement: 'tasks',
  verify: 'verification',
};

type EditableInput = { status: SpecTicketStatus; blockedFrom: string; archived: boolean };

/** Stage whose document may be edited now (a blocked ticket uses the stage it was blocked from), or null. */
export function editableStage(t: EditableInput): SpecStage | null {
  if (t.archived) return null;
  const stage = (t.status === 'blocked' ? t.blockedFrom : t.status) as SpecStage;
  return STAGE_DOCUMENT[stage] ? stage : null;
}

/** The one document a human may edit now, or null (archived, done, unknown stage). */
export function editableDocument(t: EditableInput): SpecDocument | null {
  const stage = editableStage(t);
  return stage ? STAGE_DOCUMENT[stage] ?? null : null;
}

export interface SpecTicketSummary {
  id: string;
  title: string;
  type: string;
  status: SpecTicketStatus;
  awaiting: string;
  autopilot: boolean;
  modules: string[];
  approvals: string[];
  owner: string;
  created: string;
  blockedFrom: string;
  blockedReason: string;
  archived: boolean;
  dir: string;
  tasks: { done: number; total: number };
  acs: string[];
  /** The last 20 `## Log` entries of ticket.md, oldest first, without the leading "- " (list only; [] elsewhere). */
  recentLog: string[];
}

export interface SpecTicketLoadError {
  dir: string;
  error: string;
}

export interface SpecTicketList {
  user: string;
  /** Ticket types allowed by specs/config.json. */
  types: string[];
  tickets: SpecTicketSummary[];
  errors: SpecTicketLoadError[];
}

export interface SpecGateResult {
  stage: string;
  pass: boolean;
  errors: string[];
  warnings: string[];
  exceptions: string[];
}

export interface SpecEvidence {
  result: 'pass' | 'fail';
  ranAt: string;
  modules: string[];
  fresh: boolean;
  coversModules: boolean;
}

export interface SpecTask {
  id: string;
  done: boolean;
  acs: string[];
  summary: string;
}

export interface SpecTicketDetail extends SpecTicketSummary {
  goal: string;
  log: string[];
  taskList: SpecTask[];
  gate: SpecGateResult | null;
  evidence: SpecEvidence | null;
  next: string;
  documents: Partial<Record<SpecDocument, string>>;
}

export type SpecAction =
  | { kind: 'new'; title: string; type: string; modules: string[]; goal: string }
  | { kind: 'advance'; id: string }
  | { kind: 'approve'; id: string }
  | { kind: 'reopen'; id: string; stage: SpecStage; reason: string }
  | { kind: 'block'; id: string; reason: string }
  | { kind: 'unblock'; id: string }
  | { kind: 'note'; id: string; text: string }
  | { kind: 'autopilot'; id: string; on: boolean };

/** Outcome of saving a document or ticking a task; `conflict` means the file changed on disk meanwhile. */
export type SpecSaveResult =
  | { status: 'saved'; content: string }
  | { status: 'conflict'; diskContent: string };

export interface SpecActionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  awaitingApproval: boolean;
}
