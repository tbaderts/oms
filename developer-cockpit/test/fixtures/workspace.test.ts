import { afterEach, describe, expect, it } from 'vitest';
import { createWorkspace, ticketMeta, type Workspace } from './workspace';

describe('fixture workspace', () => {
  let ws: Workspace;
  afterEach(() => ws?.cleanup());

  it('runs the copied spec CLI against an empty workspace', () => {
    ws = createWorkspace();
    const r = ws.cli('list');
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('No tickets.');
  });

  it('lists a ticket written by writeTicket', () => {
    ws = createWorkspace();
    ws.writeTicket('changes/SPEC-0001-a', ticketMeta('SPEC-0001'));
    expect(ws.cli('list').stdout).toContain('SPEC-0001');
  });
});
