import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

/** developer-cockpit/, resolved from this file so tests do not depend on the working directory. */
export const COCKPIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** The OMS repository root. */
export const REPO_ROOT = path.dirname(COCKPIT_ROOT);

export interface CliResult {
  status: number;
  stdout: string;
  stderr: string;
}

export type TicketMeta = Record<string, string | boolean | string[]>;

export interface TicketDocs {
  goal?: string;
  log?: string[];
  proposal?: string;
  design?: string;
  tasks?: string;
  verification?: string;
}

export interface Workspace {
  root: string;
  cli(...args: string[]): CliResult;
  git(...args: string[]): string;
  writeTicket(folder: string, meta: TicketMeta, docs?: TicketDocs): string;
  readTicket(folder: string): string;
  cleanup(): void;
}

/**
 * A throw-away git workspace containing a copy of the real spec tooling
 * (specs/tools, templates, policies, config.json). Tests never touch the repository's own specs/.
 */
export function createWorkspace(opts: { user?: string } = {}): Workspace {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-spec-'));
  const specs = path.join(root, 'specs');
  for (const dir of ['tools', 'templates', 'policies']) {
    fs.cpSync(path.join(REPO_ROOT, 'specs', dir), path.join(specs, dir), { recursive: true });
  }
  fs.copyFileSync(path.join(REPO_ROOT, 'specs', 'config.json'), path.join(specs, 'config.json'));
  fs.mkdirSync(path.join(specs, 'changes'), { recursive: true });
  fs.mkdirSync(path.join(specs, 'archive'), { recursive: true });
  fs.writeFileSync(path.join(specs, 'changes', '.gitkeep'), '');
  fs.writeFileSync(path.join(specs, 'archive', '.gitkeep'), '');
  fs.mkdirSync(path.join(root, 'oms-knowledge-base'), { recursive: true });
  fs.writeFileSync(path.join(root, 'oms-knowledge-base', 'README.md'), '# Knowledge base\n');

  const git = (...args: string[]): string => {
    const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
    return r.stdout;
  };
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', opts.user || 'Alice');
  git('config', 'user.email', 'test@example.com');
  git('config', 'core.autocrlf', 'false');
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  // An empty local value (not --unset) so the developer's global user.name does not leak in.
  if (opts.user === '') git('config', 'user.name', '');

  const cli = (...args: string[]): CliResult => {
    const r = spawnSync(process.execPath, [path.join(specs, 'tools', 'spec.mjs'), ...args], {
      cwd: root,
      encoding: 'utf8',
    });
    return { status: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
  };

  const writeTicket = (folder: string, meta: TicketMeta, docs: TicketDocs = {}): string => {
    const dir = path.join(specs, folder);
    fs.mkdirSync(dir, { recursive: true });
    const id = String(meta.id);
    const fm = Object.entries(meta)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.join(', ')}]` : v}`.trimEnd())
      .join('\n');
    const log = (docs.log ?? ['2026-10-24 created']).map((l) => `- ${l}`).join('\n');
    fs.writeFileSync(
      path.join(dir, 'ticket.md'),
      `---\n${fm}\n---\n\n# ${id} — ${meta.title}\n\n## Goal\n\n${docs.goal ?? 'A goal.'}\n\n## Log\n\n${log}\n`,
    );
    const files: [keyof TicketDocs, string][] = [
      ['proposal', 'proposal.md'],
      ['design', 'design.md'],
      ['tasks', 'tasks.md'],
      ['verification', 'verification.md'],
    ];
    for (const [key, name] of files) {
      if (docs[key] !== undefined) fs.writeFileSync(path.join(dir, name), docs[key] as string);
    }
    return dir;
  };

  return {
    root,
    cli,
    git,
    writeTicket,
    readTicket: (folder) => fs.readFileSync(path.join(specs, folder, 'ticket.md'), 'utf8'),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

/** Front-matter for a ticket, with the same keys and order as specs/templates/ticket.md. */
export function ticketMeta(id: string, overrides: TicketMeta = {}): TicketMeta {
  return {
    id,
    title: `Ticket ${id}`,
    type: 'feature',
    status: 'proposal',
    awaiting: '',
    autopilot: false,
    modules: ['oms-knowledge-base'],
    approvals: [],
    owner: 'Alice',
    beads: '',
    created: '2026-10-24',
    blocked_from: '',
    blocked_reason: '',
    ...overrides,
  };
}

/** A proposal that passes the proposal gate, with `acCount` acceptance criteria. */
export function proposalDoc(acCount = 1): string {
  const acs = Array.from({ length: acCount }, (_, i) =>
    `- **AC-${i + 1}** — Given a context, when an action happens, then outcome ${i + 1} is observable.`).join('\n');
  return [
    '# Proposal', '', '## Why', '', 'Because.', '', '## What Changes', '', '- A change.', '',
    '## Scope', '', '### In scope', '', 'This.', '', '### Out of scope', '', 'That.', '',
    '## Acceptance Criteria', '', acs, '', '## Impact', '', '| Area | Impact |', '|---|---|',
    '| Modules | oms-knowledge-base |', '', '## Open Questions', '', 'None.', '',
  ].join('\n');
}

/** A tasks.md with `total` tasks of which the first `done` are ticked, each covering AC-1. */
export function tasksDoc(done: number, total: number): string {
  const tasks = Array.from({ length: total }, (_, i) =>
    `- [${i < done ? 'x' : ' '}] **T-${i + 1}** Task number ${i + 1} (AC-1)\n  - verify: \`true\` passes`).join('\n');
  return `# Tasks\n\n## Tasks\n\n${tasks}\n\n## Notes\n\nNone.\n`;
}
