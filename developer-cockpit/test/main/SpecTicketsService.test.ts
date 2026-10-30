import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SpecTicketsService } from '../../src/main/services/SpecTicketsService';
import { createWorkspace, proposalDoc, tasksDoc, ticketMeta, type Workspace } from '../fixtures/workspace';

describe('SpecTicketsService', () => {
  let ws: Workspace;
  afterEach(() => ws?.cleanup());

  it('listTickets maps front-matter of active and archived tickets', async () => {
    ws = createWorkspace();
    ws.writeTicket('changes/SPEC-0001-alpha', ticketMeta('SPEC-0001', {
      title: 'Alpha', type: 'fix', status: 'design', awaiting: 'design', autopilot: true,
      modules: ['oms-core', 'oms-contracts'], approvals: ['proposal'], owner: 'Alice',
    }), { proposal: proposalDoc(2), tasks: tasksDoc(1, 3) });
    ws.writeTicket('changes/SPEC-0002-beta', ticketMeta('SPEC-0002', {
      title: 'Beta', status: 'blocked', blocked_from: 'plan', blocked_reason: 'needs a decision', owner: 'Bob',
    }));
    ws.writeTicket('archive/SPEC-0003-gamma', ticketMeta('SPEC-0003', { title: 'Gamma', status: 'done' }));
    const svc = new SpecTicketsService(ws.root);

    const active = await svc.listTickets(false);
    expect(active.user).toBe('Alice');
    expect(active.errors).toEqual([]);
    expect(active.tickets.map((t) => t.id)).toEqual(['SPEC-0001', 'SPEC-0002']);
    expect(active.tickets[0]).toEqual({
      id: 'SPEC-0001', title: 'Alpha', type: 'fix', status: 'design', awaiting: 'design', autopilot: true,
      modules: ['oms-core', 'oms-contracts'], approvals: ['proposal'], owner: 'Alice',
      created: '2026-10-24', blockedFrom: '', blockedReason: '', archived: false,
      dir: 'specs/changes/SPEC-0001-alpha', tasks: { done: 1, total: 3 }, acs: ['AC-1', 'AC-2'],
      recentLog: ['2026-10-24 created'],
    });
    expect(active.tickets[1]).toMatchObject({
      status: 'blocked', blockedFrom: 'plan', blockedReason: 'needs a decision', owner: 'Bob',
      autopilot: false, approvals: [], tasks: { done: 0, total: 0 }, acs: [],
    });

    const all = await svc.listTickets(true);
    expect(all.tickets.map((t) => t.id)).toEqual(['SPEC-0001', 'SPEC-0002', 'SPEC-0003']);
    expect(all.tickets[2]).toMatchObject({ id: 'SPEC-0003', status: 'done', archived: true, dir: 'specs/archive/SPEC-0003-gamma' });
  });

  it('listTickets returns the last 20 log entries per ticket', async () => {
    ws = createWorkspace();
    const log = ['2026-10-24 created', ...Array.from({ length: 24 }, (_, i) => `2026-10-25 10:${String(i).padStart(2, '0')} — note ${i}`)];
    ws.writeTicket('changes/SPEC-0001-alpha', ticketMeta('SPEC-0001'), { log });
    ws.writeTicket('changes/SPEC-0002-beta', ticketMeta('SPEC-0002'));
    const svc = new SpecTicketsService(ws.root);

    let list = await svc.listTickets(false);
    expect(list.tickets[0].recentLog).toEqual(log.slice(-20));
    expect(list.tickets[0].recentLog[19]).toBe('2026-10-25 10:23 — note 23');
    expect(list.tickets[1].recentLog).toEqual(['2026-10-24 created']);

    // A ticket.md without a Log section lists with no entries rather than failing.
    const file = path.join(ws.root, 'specs', 'changes', 'SPEC-0002-beta', 'ticket.md');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/## Log[\s\S]*$/, ''));
    list = await svc.listTickets(false);
    expect(list.tickets.map((t) => t.id)).toEqual(['SPEC-0001', 'SPEC-0002']);
    expect(list.tickets[1].recentLog).toEqual([]);
  });

  it('listTickets returns the configured ticket types', async () => {
    ws = createWorkspace();
    const config = JSON.parse(fs.readFileSync(path.join(ws.root, 'specs', 'config.json'), 'utf8'));
    const list = await new SpecTicketsService(ws.root).listTickets(false);
    expect(list.types).toEqual(config.types);
    expect(list.types).toContain('feature');
  });

  it('getTicket reports stage, tasks, ACs and the CLI gate result', async () => {
    ws = createWorkspace();
    ws.writeTicket('changes/SPEC-0001-plan', ticketMeta('SPEC-0001', { status: 'plan', approvals: ['proposal'] }), {
      proposal: proposalDoc(4),
      tasks: tasksDoc(3, 5),
    });
    const svc = new SpecTicketsService(ws.root);

    const detail = await svc.getTicket('SPEC-0001');
    expect(detail.status).toBe('plan');
    expect(detail.tasks).toEqual({ done: 3, total: 5 });
    expect(detail.acs).toHaveLength(4);
    expect(detail.taskList.map((t) => [t.id, t.done])).toEqual([
      ['T-1', true], ['T-2', true], ['T-3', true], ['T-4', false], ['T-5', false],
    ]);
    expect(detail.taskList[0].summary).toBe('Task number 1 (AC-1)');

    const gateJson = ws.cli('gate', 'SPEC-0001', '--json');
    expect(detail.gate).toEqual(JSON.parse(gateJson.stdout));
    expect(detail.gate).toMatchObject({ stage: 'plan', pass: false });

    const gateText = ws.cli('gate', 'SPEC-0001');
    const textErrors = gateText.stdout.split(/\r?\n/).filter((l) => l.startsWith('  ERROR ')).map((l) => l.slice(8));
    expect(detail.gate!.errors).toEqual(textErrors);
    expect(textErrors).toContain('tasks.md: no task covers AC-2');
  });

  it('getTicket returns goal, documents, log and evidence freshness', async () => {
    ws = createWorkspace();
    ws.writeTicket('changes/SPEC-0001-docs', ticketMeta('SPEC-0001', { status: 'verify' }), {
      goal: 'Let users see their tickets.',
      log: ['2026-10-24 created', '2026-10-24 10:00 — proposal → design'],
      proposal: proposalDoc(1),
      tasks: tasksDoc(1, 1),
    });
    const svc = new SpecTicketsService(ws.root);

    const before = await svc.getTicket('SPEC-0001');
    expect(before.goal).toBe('Let users see their tickets.');
    expect(before.log).toEqual(['2026-10-24 created', '2026-10-24 10:00 — proposal → design']);
    expect(Object.keys(before.documents).sort()).toEqual(['proposal', 'tasks']);
    expect(before.documents.proposal).toContain('**AC-1**');
    expect(before.evidence).toBeNull();

    ws.cli('verify', 'SPEC-0001');
    const fresh = await svc.getTicket('SPEC-0001');
    expect(fresh.evidence).toMatchObject({ modules: ['oms-knowledge-base'], fresh: true, coversModules: true });
    expect(fresh.evidence!.ranAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    fs.appendFileSync(path.join(ws.root, 'oms-knowledge-base', 'README.md'), 'changed\n');
    const stale = await svc.getTicket('SPEC-0001');
    expect(stale.evidence).toMatchObject({ fresh: false });
  });

  it('bad ticket folders become error entries without breaking others', async () => {
    ws = createWorkspace();
    ws.writeTicket('changes/SPEC-0001-good', ticketMeta('SPEC-0001'));
    fs.mkdirSync(path.join(ws.root, 'specs', 'changes', 'SPEC-0002-missing'));
    fs.mkdirSync(path.join(ws.root, 'specs', 'changes', 'SPEC-0003-nofm'));
    fs.writeFileSync(path.join(ws.root, 'specs', 'changes', 'SPEC-0003-nofm', 'ticket.md'), '# no front-matter\n');
    const svc = new SpecTicketsService(ws.root);

    const list = await svc.listTickets(false);
    expect(list.tickets.map((t) => t.id)).toEqual(['SPEC-0001']);
    expect(list.errors).toEqual([
      { dir: 'specs/changes/SPEC-0002-missing', error: 'ticket.md is missing' },
      { dir: 'specs/changes/SPEC-0003-nofm', error: 'ticket.md has no front-matter or no id' },
    ]);

    const detail = await svc.getTicket('SPEC-0001');
    expect(detail.id).toBe('SPEC-0001');
    const note = await svc.runAction({ kind: 'note', id: 'SPEC-0001', text: 'still works' });
    expect(note.exitCode).toBe(0);
    expect(ws.readTicket('changes/SPEC-0001-good')).toContain('still works');

    const textList = ws.cli('list');
    expect(textList.status).toBe(0);
    expect(textList.stdout).toContain('SPEC-0001');
    expect(textList.stderr).toContain('specs/changes/SPEC-0002-missing: ticket.md is missing');

    const ci = ws.cli('ci');
    expect(ci.stderr).not.toMatch(/\n\s+at /); // no stack trace from a crash
    expect(ci.stdout).toContain('Policy check');
  });
});
