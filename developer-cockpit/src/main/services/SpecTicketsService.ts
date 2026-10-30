import * as fs from 'fs';
import * as path from 'path';
import { SpecCli } from './SpecCli';
import {
  DOCUMENT_FILES,
  SPEC_DOCUMENTS,
  SPEC_STAGES,
  editableDocument,
  editableStage,
  type SpecAction,
  type SpecActionResult,
  type SpecDocument,
  type SpecSaveResult,
  type SpecStage,
  type SpecEvidence,
  type SpecGateResult,
  type SpecTask,
  type SpecTicketDetail,
  type SpecTicketList,
  type SpecTicketSummary,
  type SpecTicketStatus,
} from '../../shared/types/specTickets';

/** Shape of one ticket in `spec.mjs list --json` / `status --json`. */
interface CliTicket {
  id: string;
  dir: string;
  archived: boolean;
  meta: Record<string, unknown>;
  tasks: { done: number; total: number };
  acs: string[];
}

interface CliList {
  user: string;
  types: string[];
  tickets: CliTicket[];
  errors: { dir: string; error: string }[];
}

interface CliStatus extends CliTicket {
  goal: string;
  log: string[];
  taskList: SpecTask[];
  gate: SpecGateResult | null;
  evidence: SpecEvidence | null;
  next: string;
}

const ID_PATTERN = /^SPEC-\d{4}$/;
const TASK_PATTERN = /^T-\d+$/;
const MAX_DOCUMENT_BYTES = 1024 * 1024;
// Log entries per ticket in the list; the Dashboard's activity feed shows at most this many in total.
const RECENT_LOG = 20;
// Module names as in specs/config.json; the CLI checks that they exist.
const MODULE_PATTERN = /^\w[\w.-]*$/;
const ACTION_KINDS = ['new', 'advance', 'approve', 'reopen', 'block', 'unblock', 'note', 'autopilot'];

export class SpecTicketsService {
  private cli: SpecCli;

  constructor(private workspaceRoot: string, cli?: SpecCli) {
    this.cli = cli ?? new SpecCli(workspaceRoot);
  }

  async listTickets(includeArchived: boolean): Promise<SpecTicketList> {
    const list = await this.cli.json<CliList>(includeArchived ? ['list', '--all'] : ['list']);
    return {
      user: list.user ?? '',
      types: list.types ?? [],
      tickets: list.tickets.map((t) => ({ ...toSummary(t), recentLog: this.readRecentLog(t.dir) })),
      errors: list.errors ?? [],
    };
  }

  /** The last RECENT_LOG entries of the ticket's `## Log`; [] when ticket.md cannot be read. */
  private readRecentLog(dir: string): string[] {
    const specs = path.resolve(this.workspaceRoot, 'specs') + path.sep;
    const file = path.resolve(this.workspaceRoot, dir, 'ticket.md');
    if (!file.startsWith(specs)) return [];
    let text: string;
    try {
      text = fs.readFileSync(file, 'utf-8');
    } catch {
      return [];
    }
    const log = text.match(/^## Log[ \t]*\r?\n([\s\S]*?)(?=^## |(?![\s\S]))/m)?.[1] ?? '';
    return log.split(/\r?\n/).filter((l) => l.startsWith('- ')).map((l) => l.slice(2).trimEnd()).slice(-RECENT_LOG);
  }

  async getTicket(id: string): Promise<SpecTicketDetail> {
    assertId(id);
    const s = await this.cli.json<CliStatus>(['status', id]);
    const documents: Partial<Record<SpecDocument, string>> = {};
    const dir = path.join(this.workspaceRoot, s.dir);
    for (const name of SPEC_DOCUMENTS) {
      const file = path.join(dir, DOCUMENT_FILES[name]);
      if (fs.existsSync(file)) documents[name] = fs.readFileSync(file, 'utf-8');
    }
    return {
      ...toSummary(s),
      goal: s.goal ?? '',
      log: s.log ?? [],
      taskList: s.taskList ?? [],
      gate: s.gate,
      evidence: s.evidence,
      next: s.next ?? '',
      documents,
    };
  }

  /**
   * Writes the ticket's current-stage document. Unless `force`, nothing is written when the file no
   * longer equals `baseContent` (the text the editor loaded): the caller gets the disk content instead.
   */
  async saveDocument(id: string, doc: SpecDocument, content: string, baseContent: string, force: boolean): Promise<SpecSaveResult> {
    assertDocumentText(content);
    const { file } = await this.editableFile(id, doc);
    return this.writeIfUnchanged(id, file, content, baseContent, force);
  }

  /** The current stage's gate as if `doc` had `content`; nothing is written. */
  async draftGate(id: string, doc: SpecDocument, content: string): Promise<SpecGateResult> {
    assertDocumentText(content);
    const { stage } = await this.editableFile(id, doc);
    return this.cli.json<SpecGateResult>(['gate', id, stage, '--draft', DOCUMENT_FILES[doc]], content);
  }

  /** Sets task `taskId` in tasks.md to done/not done, changing only its `[ ]`/`[x]` marker. */
  async toggleTask(id: string, taskId: string, done: boolean, baseContent: string, force: boolean): Promise<SpecSaveResult> {
    if (typeof taskId !== 'string' || !TASK_PATTERN.test(taskId)) refuse(`invalid task id "${taskId}"`);
    const { file, ticket } = await this.editableFile(id, 'tasks');
    if (ticket.status !== 'implement') refuse(`${id}: tasks can be ticked only at the implement stage`);
    const disk = readExisting(id, file);
    if (!force && disk !== baseContent) return { status: 'conflict', diskContent: disk };
    const updated = setTaskMarker(disk, taskId, Boolean(done));
    if (updated === null) refuse(`${id}: ${taskId} not found in tasks.md`);
    return this.writeIfUnchanged(id, file, updated, disk, false);
  }

  /** Resolves the file of `doc` if it is the one document of ticket `id` that may be edited now. */
  private async editableFile(id: string, doc: SpecDocument): Promise<{ file: string; stage: SpecStage; ticket: SpecTicketDetail }> {
    assertId(id);
    if (!(SPEC_DOCUMENTS as readonly string[]).includes(doc)) refuse(`invalid document "${doc}"`);
    const ticket = await this.getTicket(id);
    if (ticket.archived) refuse(`${id} is archived; its documents are read-only`);
    if (ticket.status === 'done') refuse(`${id} is done; its documents are read-only`);
    const stage = editableStage(ticket);
    if (!stage || editableDocument(ticket) !== doc) refuse(`${DOCUMENT_FILES[doc]} is not editable at stage ${ticket.status}`);
    const changes = path.resolve(this.workspaceRoot, 'specs', 'changes') + path.sep;
    const file = path.resolve(this.workspaceRoot, ticket.dir, DOCUMENT_FILES[doc]);
    if (!file.startsWith(changes)) refuse(`${id}: ${file} is outside specs/changes`);
    return { file, stage: stage as SpecStage, ticket };
  }

  private writeIfUnchanged(id: string, file: string, content: string, baseContent: string, force: boolean): SpecSaveResult {
    const disk = readExisting(id, file);
    if (!force && disk !== baseContent) {
      console.warn('[spec-tickets] conflict', id, path.basename(file));
      return { status: 'conflict', diskContent: disk };
    }
    fs.writeFileSync(file, content, 'utf-8');
    console.info('[spec-tickets] saved', id, path.basename(file), force ? '(overwrite)' : '');
    return { status: 'saved', content };
  }

  async runAction(action: SpecAction): Promise<SpecActionResult> {
    const args = await this.toArgs(action);
    if ('refused' in args) {
      return { exitCode: 1, stdout: '', stderr: args.refused, awaitingApproval: false };
    }
    const r = await this.cli.run(args.argv);
    return { ...r, awaitingApproval: r.exitCode === 3 };
  }

  private async toArgs(a: SpecAction): Promise<{ argv: string[] } | { refused: string }> {
    if (!a || !ACTION_KINDS.includes(a.kind)) throw new Error(`unknown spec action "${(a as { kind?: string })?.kind}"`);
    if (a.kind !== 'new') assertId(a.id);

    switch (a.kind) {
      case 'new':
        assertText(a.title, 'title');
        assertText(a.type, 'type');
        assertText(a.goal, 'goal');
        assertNoFlag(a.title, 'title');
        assertNoFlag(a.type, 'type');
        assertNoFlag(a.goal, 'goal');
        if (!Array.isArray(a.modules) || !a.modules.length) throw new Error('modules are required');
        for (const m of a.modules) {
          if (typeof m !== 'string' || !MODULE_PATTERN.test(m)) throw new Error(`invalid module "${m}"`);
        }
        return { argv: ['new', a.title, '--type', a.type, '--modules', a.modules.join(','), '--goal', a.goal] };
      case 'advance':
        return { argv: ['advance', a.id] };
      case 'reopen':
        if (!(SPEC_STAGES as readonly string[]).includes(a.stage)) throw new Error(`unknown stage "${a.stage}"`);
        assertNoFlag(a.reason, 'reason');
        return { argv: ['reopen', a.id, a.stage, a.reason ?? ''] };
      case 'block':
        assertNoFlag(a.reason, 'reason');
        return { argv: ['block', a.id, a.reason ?? ''] };
      case 'unblock':
        return { argv: ['unblock', a.id] };
      case 'note':
        assertNoFlag(a.text, 'note');
        return { argv: ['note', a.id, a.text ?? ''] };
      case 'autopilot':
        return { argv: ['autopilot', a.id, a.on ? 'on' : 'off'] };
      case 'approve': {
        const [list, ticket] = await Promise.all([this.listTickets(false), this.getTicket(a.id)]);
        if (!ticket.awaiting) return { refused: `${a.id} is not awaiting approval` };
        if (!list.user) return { refused: 'set git user.name before approving' };
        return { argv: ['approve', a.id, ticket.awaiting, '--by', list.user] };
      }
    }
  }
}

/** Logs and throws a refused document request; the IPC call rejects with this message. */
function refuse(msg: string): never {
  console.warn('[spec-tickets] refused:', msg);
  throw new Error(msg);
}

/** Documents are created by `spec new`; the cockpit only edits existing ones. */
function readExisting(id: string, file: string): string {
  if (!fs.existsSync(file)) refuse(`${id}: ${path.basename(file)} does not exist`);
  return fs.readFileSync(file, 'utf-8');
}

function assertDocumentText(content: unknown): void {
  if (typeof content !== 'string') refuse('document content must be text');
  if (Buffer.byteLength(content as string, 'utf-8') > MAX_DOCUMENT_BYTES) refuse('document is too large (max 1 MB)');
}

/** Flips the marker of the first `- [ ] **T-n**` line outside HTML comments (spec.mjs ignores those). */
function setTaskMarker(md: string, taskId: string, done: boolean): string | null {
  const comments = [...md.matchAll(/<!--[\s\S]*?-->/g)].map((m) => [m.index, m.index + m[0].length]);
  for (const m of md.matchAll(new RegExp(`^([ \\t]*-[ \\t]*\\[)[ xX](\\][ \\t]*\\*\\*${taskId}\\*\\*)`, 'gm'))) {
    const at = m.index + m[1].length;
    if (comments.some(([start, end]) => at >= start && at < end)) continue;
    return md.slice(0, at) + (done ? 'x' : ' ') + md.slice(at + 1);
  }
  return null;
}

function assertId(id: string): void {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) throw new Error(`invalid ticket id "${id}"`);
}

function assertText(value: unknown, name: string): void {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`);
}

/** spec.mjs reads any argument starting with -- as a flag, so such text would be misparsed. */
function assertNoFlag(value: unknown, name: string): void {
  if (typeof value === 'string' && value.trim().startsWith('--')) throw new Error(`${name} must not start with --`);
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function list(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  return typeof v === 'string' && v ? [v] : [];
}

function toSummary(t: CliTicket): SpecTicketSummary {
  const m = t.meta ?? {};
  return {
    id: t.id,
    title: str(m.title),
    type: str(m.type),
    status: str(m.status) as SpecTicketStatus,
    awaiting: str(m.awaiting),
    autopilot: m.autopilot === true,
    modules: list(m.modules),
    approvals: list(m.approvals),
    owner: str(m.owner),
    created: str(m.created),
    blockedFrom: str(m.blocked_from),
    blockedReason: str(m.blocked_reason),
    archived: t.archived === true,
    dir: t.dir,
    tasks: t.tasks ?? { done: 0, total: 0 },
    acs: t.acs ?? [],
    recentLog: [],
  };
}
