import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { createWorkspace, proposalDoc, tasksDoc, ticketMeta, type Workspace } from '../fixtures/workspace';

/** Front matter of a ticket.md as key → raw value. */
function frontMatter(text: string): Record<string, string> {
  const block = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
  return Object.fromEntries(
    block.split(/\r?\n/).map((l) => {
      const i = l.indexOf(':');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
  );
}

/** Every file of a folder with its content, to prove that nothing was written. */
function snapshotDir(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of fs.readdirSync(dir, { recursive: true }) as string[]) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isFile()) out[name] = fs.readFileSync(p, 'utf8');
  }
  return out;
}

/** Runs the workspace's PreToolUse hook on a Bash command, as Claude Code would. */
function preToolHook(ws: Workspace, command: string) {
  const r = spawnSync(process.execPath, [path.join(ws.root, 'specs', 'tools', 'spec.mjs'), 'hook', 'pre-tool'], {
    cwd: ws.root,
    encoding: 'utf8',
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
  });
  return { status: r.status ?? -1, stderr: r.stderr };
}

describe('spec.mjs withdraw (SPEC-0040)', () => {
  let ws: Workspace;
  afterEach(() => ws?.cleanup());

  // AC-1
  it('withdraws a ticket at any stage before done', () => {
    ws = createWorkspace();
    ws.writeTicket('changes/SPEC-0001-proposal', ticketMeta('SPEC-0001', { autopilot: true }), { proposal: proposalDoc(1) });
    ws.writeTicket('changes/SPEC-0002-implement', ticketMeta('SPEC-0002', { status: 'implement', approvals: ['proposal'] }), {
      proposal: proposalDoc(1),
      tasks: tasksDoc(1, 2),
    });
    ws.writeTicket('changes/SPEC-0003-blocked', ticketMeta('SPEC-0003', {
      status: 'blocked', blocked_from: 'design', blocked_reason: 'waiting',
    }), { proposal: proposalDoc(1) });
    ws.writeTicket('changes/SPEC-0004-awaiting', ticketMeta('SPEC-0004', { awaiting: 'proposal' }), { proposal: proposalDoc(1) });

    const expectedFrom: Record<string, string> = {
      'SPEC-0001-proposal': 'proposal',
      'SPEC-0002-implement': 'implement',
      'SPEC-0003-blocked': 'design',
      'SPEC-0004-awaiting': 'proposal',
    };
    for (const [folder, from] of Object.entries(expectedFrom)) {
      const id = folder.slice(0, 9);
      const r = ws.cli('withdraw', id, 'Superseded', 'by', 'SPEC-0039');
      expect(r.status, `${id}: ${r.stderr}`).toBe(0);
      expect(fs.existsSync(path.join(ws.root, 'specs', 'changes', folder)), id).toBe(false);

      const text = ws.readTicket(`archive/${folder}`);
      const meta = frontMatter(text);
      expect(meta.status, id).toBe('withdrawn');
      expect(meta.withdrawn_from, id).toBe(from);
      expect(meta.withdrawn_reason, id).toBe('Superseded by SPEC-0039');
      expect(meta.awaiting, id).toBe('');
      expect(meta.autopilot, id).toBe('false');
      expect(text, id).toMatch(/^- .* — withdrawn: Superseded by SPEC-0039$/m);
    }
  });

  // AC-2
  it('refuses without a reason, for done, unknown or archived tickets', () => {
    ws = createWorkspace();
    const open = ws.writeTicket('changes/SPEC-0001-open', ticketMeta('SPEC-0001'), { proposal: proposalDoc(1) });
    const done = ws.writeTicket('changes/SPEC-0002-done', ticketMeta('SPEC-0002', { status: 'done', approvals: ['proposal'] }), {
      proposal: proposalDoc(1),
    });
    // Not done, so "already archived" cannot be mistaken for the done refusal.
    const archived = ws.writeTicket('archive/SPEC-0003-archived', ticketMeta('SPEC-0003', { status: 'design' }), {
      proposal: proposalDoc(1),
    });
    const before = [open, done, archived].map(snapshotDir);

    const noReason = ws.cli('withdraw', 'SPEC-0001');
    expect(noReason.status).not.toBe(0);
    expect(noReason.stderr + noReason.stdout).toMatch(/reason|usage/i);

    const isDone = ws.cli('withdraw', 'SPEC-0002', 'not needed');
    expect(isDone.status).not.toBe(0);
    expect(isDone.stderr + isDone.stdout).toMatch(/done/i);

    const blank = ws.cli('withdraw', 'SPEC-0001', '   ');
    expect(blank.status).not.toBe(0);
    expect(blank.stderr + blank.stdout).toMatch(/usage/i);

    const unknown = ws.cli('withdraw', 'SPEC-0099', 'not needed');
    expect(unknown.status).not.toBe(0);
    expect(unknown.stderr + unknown.stdout).toMatch(/No ticket matches/);

    const already = ws.cli('withdraw', 'SPEC-0003', 'not needed');
    expect(already.status).not.toBe(0);
    expect(already.stderr + already.stdout).toMatch(/already archived/);

    expect([open, done, archived].map(snapshotDir)).toEqual(before);
  });

  // AC-2: the archive move cannot half-happen. A folder of the same name in the archive is refused
  // before anything is written, and a ticket left withdrawn but unmoved is refused too.
  it('refuses when the archive target exists, and an unmoved withdrawn ticket', () => {
    ws = createWorkspace();
    const open = ws.writeTicket('changes/SPEC-0001-clash', ticketMeta('SPEC-0001'), { proposal: proposalDoc(1) });
    fs.mkdirSync(path.join(ws.root, 'specs', 'archive', 'SPEC-0001-clash'), { recursive: true });
    const stuck = ws.writeTicket('changes/SPEC-0002-stuck', ticketMeta('SPEC-0002', {
      status: 'withdrawn', withdrawn_from: 'design', withdrawn_reason: 'x',
    }), { proposal: proposalDoc(1) });
    const before = [open, stuck].map(snapshotDir);

    const clash = ws.cli('withdraw', 'SPEC-0001', 'not needed');
    expect(clash.status).not.toBe(0);
    expect(clash.stderr + clash.stdout).toMatch(/already exists/);

    const again = ws.cli('withdraw', 'SPEC-0002', 'not needed');
    expect(again.status).not.toBe(0);
    expect(again.stderr + again.stdout).toMatch(/already withdrawn/);

    expect([open, stuck].map(snapshotDir)).toEqual(before);
  });

  // AC-3
  it('a withdrawn ticket leaves the active views and ci', () => {
    ws = createWorkspace();
    const template = fs.readFileSync(path.join(ws.root, 'specs', 'templates', 'proposal.md'), 'utf8');
    // At plan with an unfilled proposal: ci re-checks the passed proposal gate and fails on it.
    ws.writeTicket('changes/SPEC-0001-stale', ticketMeta('SPEC-0001', { status: 'plan', approvals: ['proposal'] }), {
      proposal: template,
    });
    ws.git('add', '-A');
    ws.git('commit', '-q', '-m', 'stale ticket');
    expect(ws.cli('ci').status, 'ci fails while the stale ticket is active').not.toBe(0);

    expect(ws.cli('withdraw', 'SPEC-0001', 'Merged into SPEC-0002').status).toBe(0);

    expect(ws.cli('list').stdout).not.toContain('SPEC-0001');
    const all = ws.cli('list', '--all');
    expect(all.stdout).toMatch(/SPEC-0001\s+withdrawn/);
    const json = JSON.parse(ws.cli('list', '--all', '--json').stdout);
    const listed = json.tickets.find((t: { id: string }) => t.id === 'SPEC-0001');
    expect(listed.meta.status).toBe('withdrawn');
    expect(listed.meta.withdrawn_reason).toBe('Merged into SPEC-0002');
    const status = ws.cli('status', 'SPEC-0001');
    expect(status.stdout).toContain('withdrawn');
    expect(status.stdout).toContain('Merged into SPEC-0002');
    expect(status.stdout).not.toContain('undefined');
    expect(JSON.parse(ws.cli('status', 'SPEC-0001', '--json').stdout).next).toMatch(/withdrawn/i);
    const ci = ws.cli('ci');
    expect(ci.status, ci.stdout + ci.stderr).toBe(0);
  });

  // AC-4
  it('the pre-tool hook denies withdraw like approve', () => {
    ws = createWorkspace();
    ws.writeTicket('changes/SPEC-0001-open', ticketMeta('SPEC-0001'), { proposal: proposalDoc(1) });

    const withdraw = preToolHook(ws, 'node specs/tools/spec.mjs withdraw SPEC-0001 "not needed"');
    expect(withdraw.status).toBe(2);
    expect(withdraw.stderr).toMatch(/withdraw/i);
    expect(withdraw.stderr).toMatch(/requester/i);

    expect(preToolHook(ws, 'node specs/tools/spec.mjs approve SPEC-0001').status).toBe(2);
    expect(preToolHook(ws, 'node specs/tools/spec.mjs list').status).toBe(0);
  });
});
