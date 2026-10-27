import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { performance } from 'perf_hooks';
import { SpecTicketsService } from '../../src/main/services/SpecTicketsService';
import { createWorkspace, proposalDoc, tasksDoc, ticketMeta, type Workspace } from '../fixtures/workspace';

describe('SpecTicketsService performance', () => {
  let ws: Workspace;
  beforeAll(() => {
    ws = createWorkspace();
    for (let i = 1; i <= 50; i++) {
      const id = `SPEC-${String(i).padStart(4, '0')}`;
      ws.writeTicket(`changes/${id}-ticket-${i}`, ticketMeta(id, { status: 'implement', owner: i % 2 ? 'Alice' : 'Bob' }), {
        proposal: proposalDoc(5),
        tasks: tasksDoc(i % 8, 8),
      });
    }
  });
  afterAll(() => ws?.cleanup());

  it('lists 50 tickets in under 1s', async () => {
    const svc = new SpecTicketsService(ws.root);
    await svc.listTickets(false); // warm-up: file system cache and process start

    const start = performance.now();
    const list = await svc.listTickets(false);
    const ms = performance.now() - start;

    expect(list.tickets).toHaveLength(50);
    expect(ms).toBeLessThan(1000);
  });
});
