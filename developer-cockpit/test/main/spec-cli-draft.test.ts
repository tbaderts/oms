import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { createWorkspace, proposalDoc, tasksDoc, ticketMeta, type Workspace } from '../fixtures/workspace';

/** Runs the workspace's spec.mjs with `input` on stdin. */
function cliWithInput(ws: Workspace, input: string, ...args: string[]) {
  const r = spawnSync(process.execPath, [path.join(ws.root, 'specs', 'tools', 'spec.mjs'), ...args], {
    cwd: ws.root,
    encoding: 'utf8',
    input,
  });
  return { status: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

/** Every file of a ticket folder with its content, to prove that nothing was written. */
function snapshotDir(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of fs.readdirSync(dir, { recursive: true }) as string[]) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isFile()) out[name] = fs.readFileSync(p, 'utf8');
  }
  return out;
}

/** Tickets at several stages, with failing and passing gates. */
function fixture(ws: Workspace): Record<string, string> {
  const template = fs.readFileSync(path.join(ws.root, 'specs', 'templates', 'proposal.md'), 'utf8');
  return {
    proposalFail: ws.writeTicket('changes/SPEC-0001-proposal-fail', ticketMeta('SPEC-0001'), { proposal: template }),
    proposalPass: ws.writeTicket('changes/SPEC-0002-proposal-pass', ticketMeta('SPEC-0002', { owner: 'Bob' }), {
      proposal: proposalDoc(2),
    }),
    plan: ws.writeTicket('changes/SPEC-0003-plan', ticketMeta('SPEC-0003', { status: 'plan', approvals: ['proposal'] }), {
      proposal: proposalDoc(2),
      tasks: tasksDoc(0, 2),
    }),
    implement: ws.writeTicket('changes/SPEC-0004-implement', ticketMeta('SPEC-0004', { status: 'implement', approvals: ['proposal'] }), {
      proposal: proposalDoc(1),
      tasks: tasksDoc(2, 3),
    }),
    verify: ws.writeTicket('changes/SPEC-0005-verify', ticketMeta('SPEC-0005', { status: 'verify', approvals: ['proposal'] }), {
      proposal: proposalDoc(1),
      tasks: tasksDoc(1, 1),
      verification: '# Verification\n\nNothing yet.\n',
    }),
  };
}

const snap = (name: string) => `./__snapshots__/spec-cli/${name}.txt`;
const show = (r: { status: number; stdout: string; stderr: string }) =>
  `exit ${r.status}\n--- stdout\n${r.stdout}--- stderr\n${r.stderr}`;

describe('spec.mjs gate --draft', () => {
  let ws: Workspace;
  afterEach(() => ws?.cleanup());

  // Recorded against the CLI before SPEC-0004 changed it; must never need updating for --draft.
  it('outputs without --draft match the pre-change snapshots', async () => {
    ws = createWorkspace();
    fixture(ws);
    const commands: [string, string[]][] = [
      ['list', ['list']],
      ['list-json', ['list', '--json']],
      ['status-0001', ['status', 'SPEC-0001']],
      ['status-0001-json', ['status', 'SPEC-0001', '--json']],
      ['status-0004-json', ['status', 'SPEC-0004', '--json']],
      ['gate-0001', ['gate', 'SPEC-0001']],
      ['gate-0001-json', ['gate', 'SPEC-0001', '--json']],
      ['gate-0003-plan', ['gate', 'SPEC-0003', 'plan']],
      ['gate-0005-json', ['gate', 'SPEC-0005', '--json']],
      ['gate-unknown-stage', ['gate', 'SPEC-0001', 'nope']],
      ['advance-0001', ['advance', 'SPEC-0001']],
      ['advance-0003', ['advance', 'SPEC-0003']],
      ['advance-0002', ['advance', 'SPEC-0002']],
      ['status-0002-after-advance', ['status', 'SPEC-0002']],
    ];
    for (const [name, args] of commands) {
      await expect(show(ws.cli(...args))).toMatchFileSnapshot(snap(name));
    }
  });

  it('gate --draft equals gate after write and writes nothing', () => {
    ws = createWorkspace();
    const dirs = fixture(ws);
    const cases: [string, string, string, string][] = [
      ['SPEC-0001', 'proposal', 'proposal.md', proposalDoc(3)],
      ['SPEC-0002', 'proposal', 'proposal.md', '# Proposal\n\n## Why\n\n<!-- FILL: x -->\n'],
      // Covers AC-2 as well, so the plan gate passes on the draft but fails on the file.
      ['SPEC-0003', 'plan', 'tasks.md', tasksDoc(1, 4).replace('Task number 2 (AC-1)', 'Task number 2 (AC-2)')],
      ['SPEC-0004', 'implement', 'tasks.md', tasksDoc(3, 3)],
      ['SPEC-0005', 'verify', 'verification.md', '# Verification\n\n## Verdict\n\nVerdict: GOAL MET\n'],
    ];
    const folder: Record<string, string> = {
      'SPEC-0001': dirs.proposalFail, 'SPEC-0002': dirs.proposalPass, 'SPEC-0003': dirs.plan,
      'SPEC-0004': dirs.implement, 'SPEC-0005': dirs.verify,
    };
    for (const [id, stage, file, draft] of cases) {
      const before = snapshotDir(folder[id]);
      const drafted = cliWithInput(ws, draft, 'gate', id, stage, '--draft', file, '--json');
      expect(snapshotDir(folder[id]), `${id} unchanged`).toEqual(before);

      fs.writeFileSync(path.join(folder[id], file), draft);
      const written = ws.cli('gate', id, stage, '--json');
      expect(drafted.status, `${id} exit`).toBe(written.status);
      expect(JSON.parse(drafted.stdout), `${id} result`).toEqual(JSON.parse(written.stdout));
      // The draft must actually be what was gated, not the old file.
      const old = JSON.parse(cliWithInput(ws, before[file] ?? '', 'gate', id, stage, '--draft', file, '--json').stdout);
      if (before[file] !== draft) expect(old, `${id} draft differs from file`).not.toEqual(JSON.parse(drafted.stdout));
    }
  });

  it('rejects unknown --draft file', () => {
    ws = createWorkspace();
    const dirs = fixture(ws);
    const before = snapshotDir(dirs.proposalFail);
    for (const file of ['ticket.md', '../x.md', 'evidence/last-run.json']) {
      const r = cliWithInput(ws, 'x', 'gate', 'SPEC-0001', '--draft', file, '--json');
      expect(r.status, file).toBe(1);
      expect(r.stderr + r.stdout, file).toMatch(/--draft must be one of/);
    }
    expect(snapshotDir(dirs.proposalFail)).toEqual(before);
  });
});
