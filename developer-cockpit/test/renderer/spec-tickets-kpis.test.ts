import { describe, expect, it } from 'vitest';
import { kpis } from '../../src/renderer/lib/spec-tickets';
import { summary } from './ticket-fixtures';

describe('kpis', () => {
  it('counts active, in progress, awaiting, blocked, done and task completion over non-archived tickets', () => {
    const tickets = [
      summary('SPEC-0001', { status: 'proposal', awaiting: 'proposal' }),
      summary('SPEC-0002', { status: 'design', awaiting: 'design', tasks: { done: 1, total: 4 } }),
      summary('SPEC-0003', { status: 'implement', tasks: { done: 2, total: 6 } }),
      summary('SPEC-0004', { status: 'blocked', blockedFrom: 'plan' }),
      summary('SPEC-0005', { status: 'done' }),
      summary('SPEC-0006', { status: 'done', archived: true, tasks: { done: 5, total: 5 } }),
    ];
    expect(kpis(tickets)).toEqual({
      active: 5,
      inProgress: 4,
      awaiting: 2,
      blocked: 1,
      done: 1,
      tasksDone: 3,
      tasksTotal: 10,
      completionPct: 30,
    });
  });

  // SPEC-0040 AC-5: withdrawn tickets are archived, so they count nowhere.
  it('withdrawn tickets are not counted', () => {
    const tickets = [
      summary('SPEC-0001', { status: 'design' }),
      summary('SPEC-0002', { status: 'withdrawn', archived: true, withdrawnFrom: 'proposal', withdrawnReason: 'x' }),
    ];
    expect(kpis(tickets)).toMatchObject({ active: 1, inProgress: 1, blocked: 0, done: 0 });
  });

  it('gives zeros and no completion for an empty portfolio', () => {
    expect(kpis([])).toEqual({
      active: 0, inProgress: 0, awaiting: 0, blocked: 0, done: 0, tasksDone: 0, tasksTotal: 0, completionPct: null,
    });
  });
});
