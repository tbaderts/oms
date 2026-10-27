import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SpecTicketsService } from '../../src/main/services/SpecTicketsService';
import { createWorkspace, proposalDoc, tasksDoc, ticketMeta, type Workspace } from '../fixtures/workspace';

/** Makes two tickets comparable: ids and log timestamps differ by construction. */
function normalize(ticketMd: string): string {
  return ticketMd
    .replace(/SPEC-\d{4}/g, 'SPEC-XXXX')
    .replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/g, 'TIMESTAMP');
}

describe('SpecTicketsService actions', () => {
  let ws: Workspace;
  afterEach(() => ws?.cleanup());

  it('advance failing gate keeps stage and returns errors', async () => {
    ws = createWorkspace();
    ws.writeTicket('changes/SPEC-0001-a', ticketMeta('SPEC-0001'));
    const svc = new SpecTicketsService(ws.root);

    const r = await svc.runAction({ kind: 'advance', id: 'SPEC-0001' });
    expect(r.exitCode).toBe(1);
    expect(r.awaitingApproval).toBe(false);
    expect(r.stdout).toContain('ERROR');
    expect((await svc.getTicket('SPEC-0001')).status).toBe('proposal');
  });

  it('advance passing gate moves stage or awaits approval', async () => {
    ws = createWorkspace();
    ws.writeTicket('changes/SPEC-0001-a', ticketMeta('SPEC-0001'), { proposal: proposalDoc(1) });
    ws.writeTicket('changes/SPEC-0002-b', ticketMeta('SPEC-0002', { status: 'plan', approvals: ['proposal'] }), {
      proposal: proposalDoc(1),
      tasks: tasksDoc(0, 1),
    });
    const svc = new SpecTicketsService(ws.root);

    const awaiting = await svc.runAction({ kind: 'advance', id: 'SPEC-0001' });
    expect(awaiting.exitCode).toBe(3);
    expect(awaiting.awaitingApproval).toBe(true);
    expect(await svc.getTicket('SPEC-0001')).toMatchObject({ status: 'proposal', awaiting: 'proposal' });

    const moved = await svc.runAction({ kind: 'advance', id: 'SPEC-0002' });
    expect(moved.exitCode).toBe(0);
    expect(moved.stdout).toContain('plan → implement');
    expect((await svc.getTicket('SPEC-0002')).status).toBe('implement');
  });

  it('new, reopen, block, unblock, note, autopilot match the CLI', async () => {
    ws = createWorkspace();
    const meta = { status: 'plan', approvals: ['proposal'] };
    ws.writeTicket('changes/SPEC-0001-twin', ticketMeta('SPEC-0001', meta), { proposal: proposalDoc(1) });
    ws.writeTicket('changes/SPEC-0002-twin', ticketMeta('SPEC-0002', meta), { proposal: proposalDoc(1) });
    const svc = new SpecTicketsService(ws.root);

    const steps: [Parameters<SpecTicketsService['runAction']>[0], string[]][] = [
      [{ kind: 'note', id: 'SPEC-0001', text: 'a note' }, ['note', 'SPEC-0002', 'a note']],
      [{ kind: 'autopilot', id: 'SPEC-0001', on: true }, ['autopilot', 'SPEC-0002', 'on']],
      [{ kind: 'autopilot', id: 'SPEC-0001', on: false }, ['autopilot', 'SPEC-0002', 'off']],
      [{ kind: 'block', id: 'SPEC-0001', reason: 'waiting on a decision' }, ['block', 'SPEC-0002', 'waiting on a decision']],
      [{ kind: 'unblock', id: 'SPEC-0001' }, ['unblock', 'SPEC-0002']],
      [{ kind: 'reopen', id: 'SPEC-0001', stage: 'design', reason: 'rethink' }, ['reopen', 'SPEC-0002', 'design', 'rethink']],
    ];
    for (const [action, cliArgs] of steps) {
      const viaService = await svc.runAction(action);
      const viaCli = ws.cli(...cliArgs);
      expect(viaService.exitCode, action.kind).toBe(viaCli.status);
      expect(normalize(ws.readTicket('changes/SPEC-0001-twin')), action.kind)
        .toBe(normalize(ws.readTicket('changes/SPEC-0002-twin')));
    }
    expect((await svc.getTicket('SPEC-0001')).status).toBe('design');

    const created = await svc.runAction({ kind: 'new', title: 'Same title', type: 'fix', modules: ['oms-core'], goal: 'A goal.' });
    expect(created.exitCode).toBe(0);
    expect(ws.cli('new', 'Same title', '--type', 'fix', '--modules', 'oms-core', '--goal', 'A goal.').status).toBe(0);
    expect(normalize(ws.readTicket('changes/SPEC-0003-same-title'))).toBe(normalize(ws.readTicket('changes/SPEC-0004-same-title')));
    expect(ws.readTicket('changes/SPEC-0003-same-title')).toContain('A goal.');
  });

  it('invalid input is rejected by the CLI without file change', async () => {
    ws = createWorkspace();
    ws.writeTicket('changes/SPEC-0001-a', ticketMeta('SPEC-0001', { status: 'design', approvals: ['proposal'] }));
    const svc = new SpecTicketsService(ws.root);
    const before = ws.readTicket('changes/SPEC-0001-a');

    const reopenForward = await svc.runAction({ kind: 'reopen', id: 'SPEC-0001', stage: 'verify', reason: 'nope' });
    expect(reopenForward.exitCode).toBe(1);
    expect(reopenForward.stderr).toContain('reopen moves a ticket back to an earlier stage');

    const blockNoReason = await svc.runAction({ kind: 'block', id: 'SPEC-0001', reason: '' });
    expect(blockNoReason.exitCode).toBe(1);
    expect(blockNoReason.stderr).toContain('usage');

    expect(ws.readTicket('changes/SPEC-0001-a')).toBe(before);

    await expect(svc.runAction({ kind: 'advance', id: '../../etc' })).rejects.toThrow('invalid ticket id');
    await expect(svc.runAction({ kind: 'rm' } as never)).rejects.toThrow('unknown spec action');
    await expect(svc.runAction({ kind: 'reopen', id: 'SPEC-0001', stage: 'nowhere' as never, reason: 'x' }))
      .rejects.toThrow('unknown stage');
    expect(ws.readTicket('changes/SPEC-0001-a')).toBe(before);
  });

  it('text starting with -- is rejected before the CLI', async () => {
    ws = createWorkspace();
    ws.writeTicket('changes/SPEC-0001-a', ticketMeta('SPEC-0001'));
    const svc = new SpecTicketsService(ws.root);
    const before = ws.readTicket('changes/SPEC-0001-a');

    await expect(svc.runAction({ kind: 'note', id: 'SPEC-0001', text: '--all good' })).rejects.toThrow('must not start with --');
    await expect(svc.runAction({ kind: 'block', id: 'SPEC-0001', reason: '  --why' })).rejects.toThrow('must not start with --');
    await expect(svc.runAction({ kind: 'new', title: '--x', type: 'fix', modules: ['oms-core'], goal: 'g' }))
      .rejects.toThrow('must not start with --');
    await expect(svc.runAction({ kind: 'new', title: 't', type: 'fix', modules: ['--x'], goal: 'g' }))
      .rejects.toThrow('invalid module "--x"');
    await expect(svc.runAction({ kind: 'new', title: 't', type: '--fix', modules: ['oms-core'], goal: 'g' }))
      .rejects.toThrow('must not start with --');
    expect(ws.cli('list').stdout).not.toContain('SPEC-0002');
    expect(ws.readTicket('changes/SPEC-0001-a')).toBe(before);
    expect((await svc.runAction({ kind: 'note', id: 'SPEC-0001', text: 'a -- b' })).exitCode).toBe(0);
  });

  it('approve requires awaiting and records git user', async () => {
    ws = createWorkspace();
    ws.writeTicket('changes/SPEC-0001-a', ticketMeta('SPEC-0001'), { proposal: proposalDoc(1) });
    const svc = new SpecTicketsService(ws.root);
    const before = ws.readTicket('changes/SPEC-0001-a');

    const notAwaiting = await svc.runAction({ kind: 'approve', id: 'SPEC-0001' });
    expect(notAwaiting).toMatchObject({ exitCode: 1, stderr: 'SPEC-0001 is not awaiting approval' });
    expect(ws.readTicket('changes/SPEC-0001-a')).toBe(before);

    expect((await svc.runAction({ kind: 'advance', id: 'SPEC-0001' })).exitCode).toBe(3);
    const approved = await svc.runAction({ kind: 'approve', id: 'SPEC-0001' });
    expect(approved.exitCode).toBe(0);

    const detail = await svc.getTicket('SPEC-0001');
    expect(detail.approvals).toContain('proposal');
    expect(detail.awaiting).toBe('');
    expect(detail.status).toBe('design');
    expect(detail.log.some((l) => l.endsWith('proposal approved by Alice'))).toBe(true);
  });

  it('approve refuses without a git user', async () => {
    ws = createWorkspace({ user: '' });
    ws.writeTicket('changes/SPEC-0001-a', ticketMeta('SPEC-0001', { awaiting: 'proposal' }), { proposal: proposalDoc(1) });
    const svc = new SpecTicketsService(ws.root);
    const before = ws.readTicket('changes/SPEC-0001-a');

    const r = await svc.runAction({ kind: 'approve', id: 'SPEC-0001' });
    expect(r).toMatchObject({ exitCode: 1, stderr: 'set git user.name before approving' });
    expect(fs.readFileSync(path.join(ws.root, 'specs/changes/SPEC-0001-a/ticket.md'), 'utf8')).toBe(before);
  });
});
