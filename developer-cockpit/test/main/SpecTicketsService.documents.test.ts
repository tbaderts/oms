import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SpecTicketsService } from '../../src/main/services/SpecTicketsService';
import { DRAFT_GATE_DEBOUNCE_MS } from '../../src/renderer/stores/docEditor';
import { createWorkspace, proposalDoc, tasksDoc, ticketMeta, type Workspace } from '../fixtures/workspace';

/** Every file under a directory with its content, to prove that nothing was written. */
function snapshotDir(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of fs.readdirSync(dir, { recursive: true }) as string[]) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isFile()) out[name] = fs.readFileSync(p, 'utf8');
  }
  return out;
}

describe('SpecTicketsService documents', () => {
  let ws: Workspace;
  afterEach(() => ws?.cleanup());

  it('saveDocument writes exactly the edited text', async () => {
    ws = createWorkspace();
    const dir = ws.writeTicket('changes/SPEC-0001-a', ticketMeta('SPEC-0001'), { proposal: '# old\n' });
    const svc = new SpecTicketsService(ws.root);
    // No trailing newline and CRLF on purpose: nothing may be normalised.
    const text = proposalDoc(2).replace(/\n/g, '\r\n') + 'last line';

    const r = await svc.saveDocument('SPEC-0001', 'proposal', text, '# old\n', false);

    expect(r).toEqual({ status: 'saved', content: text });
    expect(fs.readFileSync(path.join(dir, 'proposal.md'), 'utf8')).toBe(text);
    expect((await svc.getTicket('SPEC-0001')).gate?.pass).toBe(true);
  });

  it('saveDocument rejects ticket.md, evidence, traversal, other-stage, archived and done documents', async () => {
    ws = createWorkspace();
    ws.writeTicket('changes/SPEC-0001-design', ticketMeta('SPEC-0001', { status: 'design', approvals: ['proposal'] }), {
      proposal: proposalDoc(1), design: '# d\n', tasks: '# t\n',
    });
    fs.mkdirSync(path.join(ws.root, 'specs/changes/SPEC-0001-design/evidence'));
    fs.writeFileSync(path.join(ws.root, 'specs/changes/SPEC-0001-design/evidence/last-run.json'), '{}');
    ws.writeTicket('changes/SPEC-0002-done', ticketMeta('SPEC-0002', { status: 'done' }), { verification: '# v\n' });
    ws.writeTicket('archive/SPEC-0003-old', ticketMeta('SPEC-0003', { status: 'design' }), { design: '# d\n' });
    const svc = new SpecTicketsService(ws.root);
    const before = snapshotDir(path.join(ws.root, 'specs'));

    const attempts: [string, string, RegExp][] = [
      ['SPEC-0001', 'ticket', /invalid document/],
      ['SPEC-0001', 'ticket.md', /invalid document/],
      ['SPEC-0001', 'evidence/last-run.json', /invalid document/],
      ['SPEC-0001', '../SPEC-0002-done/verification', /invalid document/],
      ['SPEC-0001', '../../../x', /invalid document/],
      ['SPEC-0001', 'proposal', /not editable at stage design/],
      ['SPEC-0001', 'tasks', /not editable at stage design/],
      ['SPEC-0002', 'verification', /done/],
      ['SPEC-0003', 'design', /archived/],
      ['../SPEC-0001', 'design', /invalid ticket id/],
    ];
    for (const [id, doc, err] of attempts) {
      await expect(svc.saveDocument(id, doc as never, 'x', '', true), `${id} ${doc}`).rejects.toThrow(err);
    }
    await expect(svc.saveDocument('SPEC-0001', 'design', 'x'.repeat(1024 * 1024 + 1), '# d\n', true)).rejects.toThrow(/too large/);
    await expect(svc.saveDocument('SPEC-0001', 'design', 42 as never, '# d\n', true)).rejects.toThrow(/must be text/);
    expect(snapshotDir(path.join(ws.root, 'specs'))).toEqual(before);
  });

  it('save and tick report a conflict when the file changed on disk', async () => {
    ws = createWorkspace();
    const dir = ws.writeTicket('changes/SPEC-0001-a', ticketMeta('SPEC-0001', { status: 'implement', approvals: ['proposal'] }), {
      proposal: proposalDoc(1), tasks: tasksDoc(0, 2),
    });
    const svc = new SpecTicketsService(ws.root);
    const loaded = tasksDoc(0, 2);
    const changed = tasksDoc(1, 2);
    fs.writeFileSync(path.join(dir, 'tasks.md'), changed);

    expect(await svc.saveDocument('SPEC-0001', 'tasks', 'mine', loaded, false)).toEqual({ status: 'conflict', diskContent: changed });
    expect(await svc.toggleTask('SPEC-0001', 'T-2', true, loaded, false)).toEqual({ status: 'conflict', diskContent: changed });
    expect(fs.readFileSync(path.join(dir, 'tasks.md'), 'utf8')).toBe(changed);
  });

  it('saveDocument refuses a missing document, even with force', async () => {
    ws = createWorkspace();
    const dir = ws.writeTicket('changes/SPEC-0001-a', ticketMeta('SPEC-0001'), {});
    const svc = new SpecTicketsService(ws.root);

    await expect(svc.saveDocument('SPEC-0001', 'proposal', 'new', '', false)).rejects.toThrow(/proposal.md does not exist/);
    await expect(svc.saveDocument('SPEC-0001', 'proposal', 'new', '', true)).rejects.toThrow(/proposal.md does not exist/);
    expect(fs.existsSync(path.join(dir, 'proposal.md'))).toBe(false);
  });

  it('overwrite with force', async () => {
    ws = createWorkspace();
    const dir = ws.writeTicket('changes/SPEC-0001-a', ticketMeta('SPEC-0001'), { proposal: 'theirs' });
    const svc = new SpecTicketsService(ws.root);

    expect(await svc.saveDocument('SPEC-0001', 'proposal', 'mine', 'base', true)).toEqual({ status: 'saved', content: 'mine' });
    expect(fs.readFileSync(path.join(dir, 'proposal.md'), 'utf8')).toBe('mine');
  });

  it('draftGate equals gate after writing the same text and leaves the file unchanged', async () => {
    ws = createWorkspace();
    ws.writeTicket('changes/SPEC-0001-p', ticketMeta('SPEC-0001'), { proposal: '# empty\n' });
    ws.writeTicket('changes/SPEC-0002-d', ticketMeta('SPEC-0002', { status: 'design', approvals: ['proposal'] }), {
      proposal: proposalDoc(2), design: '# empty\n',
    });
    ws.writeTicket('changes/SPEC-0003-pl', ticketMeta('SPEC-0003', { status: 'blocked', blocked_from: 'plan', approvals: ['proposal'] }), {
      proposal: proposalDoc(2), tasks: tasksDoc(0, 1),
    });
    ws.writeTicket('changes/SPEC-0004-v', ticketMeta('SPEC-0004', { status: 'verify', approvals: ['proposal'] }), {
      proposal: proposalDoc(1), tasks: tasksDoc(1, 1), verification: '# empty\n',
    });
    const svc = new SpecTicketsService(ws.root);
    const cases: [string, 'proposal' | 'design' | 'tasks' | 'verification', string, string][] = [
      ['SPEC-0001', 'proposal', 'proposal', proposalDoc(3)],
      ['SPEC-0002', 'design', 'design', '# Design\n\n## Context\n\nSome context.\n'],
      ['SPEC-0003', 'tasks', 'plan', tasksDoc(0, 2).replace('Task number 2 (AC-1)', 'Task number 2 (AC-2)')],
      ['SPEC-0004', 'verification', 'verify', '# Verification\n\n## Verdict\n\nVerdict: GOAL MET\n'],
    ];
    for (const [id, doc, stage, text] of cases) {
      const ticket = await svc.getTicket(id);
      const dir = path.join(ws.root, ticket.dir);
      const before = snapshotDir(dir);

      const draft = await svc.draftGate(id, doc, text);
      expect(snapshotDir(dir), `${id} unchanged`).toEqual(before);
      expect(draft.stage).toBe(stage);

      fs.writeFileSync(path.join(dir, `${doc}.md`), text);
      const written = JSON.parse(ws.cli('gate', id, stage, '--json').stdout);
      expect(draft, id).toEqual(written);
    }
    await expect(svc.draftGate('SPEC-0001', 'design', 'x')).rejects.toThrow(/not editable/);
  });

  it('draft gate result is available within 2 s of the last keystroke', async () => {
    ws = createWorkspace();
    ws.writeTicket('changes/SPEC-0001-p', ticketMeta('SPEC-0001'), { proposal: '# empty\n' });
    const svc = new SpecTicketsService(ws.root);
    await svc.draftGate('SPEC-0001', 'proposal', proposalDoc(1)); // warm up the CLI once

    // Real CLI round trip (ticket lookup + gate) after the renderer's debounce.
    const start = Date.now();
    await new Promise((r) => setTimeout(r, DRAFT_GATE_DEBOUNCE_MS));
    const gate = await svc.draftGate('SPEC-0001', 'proposal', proposalDoc(3));
    const elapsed = Date.now() - start;

    expect(gate.pass).toBe(true);
    expect(elapsed).toBeLessThan(2000);
  });

  it('toggleTask flips only that marker', async () => {
    ws = createWorkspace();
    const dir = ws.writeTicket('changes/SPEC-0001-a', ticketMeta('SPEC-0001', { status: 'implement', approvals: ['proposal'] }), {
      proposal: proposalDoc(1), tasks: tasksDoc(1, 3).replace(/\n/g, '\r\n'),
    });
    const svc = new SpecTicketsService(ws.root);
    const file = path.join(dir, 'tasks.md');
    const original = fs.readFileSync(file, 'utf8');

    const ticked = await svc.toggleTask('SPEC-0001', 'T-2', true, original, false);
    const after = fs.readFileSync(file, 'utf8');
    expect(ticked).toEqual({ status: 'saved', content: after });
    expect(after.length).toBe(original.length);
    const diff = [...after].map((c, i) => (c !== original[i] ? i : -1)).filter((i) => i >= 0);
    expect(diff).toEqual([original.indexOf('- [ ] **T-2**') + 3]);
    expect(after).toContain('- [x] **T-2**');
    expect((await svc.getTicket('SPEC-0001')).tasks).toEqual({ done: 2, total: 3 });

    await svc.toggleTask('SPEC-0001', 'T-2', false, after, false);
    expect(fs.readFileSync(file, 'utf8')).toBe(original);
    expect((await svc.getTicket('SPEC-0001')).tasks).toEqual({ done: 1, total: 3 });

    await expect(svc.toggleTask('SPEC-0001', 'T-9', true, original, false)).rejects.toThrow(/T-9 not found/);
    await expect(svc.toggleTask('SPEC-0001', 'T-1; rm', true, original, false)).rejects.toThrow(/invalid task id/);
  });

  it('toggleTask is refused outside implement', async () => {
    ws = createWorkspace();
    const plan = ws.writeTicket('changes/SPEC-0001-a', ticketMeta('SPEC-0001', { status: 'plan', approvals: ['proposal'] }), {
      proposal: proposalDoc(1), tasks: tasksDoc(0, 1),
    });
    ws.writeTicket('changes/SPEC-0002-b', ticketMeta('SPEC-0002', { status: 'blocked', blocked_from: 'implement' }), {
      proposal: proposalDoc(1), tasks: tasksDoc(0, 1),
    });
    const svc = new SpecTicketsService(ws.root);
    const before = snapshotDir(path.join(ws.root, 'specs'));

    await expect(svc.toggleTask('SPEC-0001', 'T-1', true, tasksDoc(0, 1), true)).rejects.toThrow(/only at the implement stage/);
    await expect(svc.toggleTask('SPEC-0002', 'T-1', true, tasksDoc(0, 1), true)).rejects.toThrow(/only at the implement stage/);
    expect(snapshotDir(path.join(ws.root, 'specs'))).toEqual(before);
    expect(fs.readFileSync(path.join(plan, 'tasks.md'), 'utf8')).toBe(tasksDoc(0, 1));
  });

  it('toggleTask ignores the commented template example', async () => {
    ws = createWorkspace();
    // The real template quotes an example "> - [ ] **T-1** …" before the task list; an HTML-commented
    // task is ignored by spec.mjs too, so neither may be ticked.
    const template = fs.readFileSync(path.join(ws.root, 'specs', 'templates', 'tasks.md'), 'utf8');
    expect(template).toMatch(/^> - \[ \] \*\*T-1\*\*/m);
    const tasks = template.replace(
      /<!-- FILL: the task list -->/,
      '<!--\n- [ ] **T-1** Old idea (AC-1)\n-->\n- [ ] **T-1** Real task (AC-1)\n  - verify: `true` passes',
    );
    const dir = ws.writeTicket('changes/SPEC-0001-a', ticketMeta('SPEC-0001', { status: 'implement', approvals: ['proposal'] }), {
      proposal: proposalDoc(1), tasks,
    });
    const svc = new SpecTicketsService(ws.root);

    await svc.toggleTask('SPEC-0001', 'T-1', true, tasks, false);
    const after = fs.readFileSync(path.join(dir, 'tasks.md'), 'utf8');
    expect(after).toContain('- [x] **T-1** Real task');
    expect(after.replace('- [x] **T-1** Real task', '- [ ] **T-1** Real task')).toBe(tasks);
  });
});
