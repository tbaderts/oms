import { describe, expect, it } from 'vitest';
import { filterTickets, isMine, stageDistribution, stageIndex, summarize } from '../../src/renderer/lib/spec-tickets';
import { summary } from './ticket-fixtures';

const ALL = { mineOnly: false, stage: '', module: '', text: '' };

describe('spec-tickets lib', () => {
  it('filterTickets mine-only, all, and no-user fallback', () => {
    const tickets = [
      summary('SPEC-0001', { owner: 'Alice', title: 'Reject zero qty', modules: ['oms-core'], status: 'design' }),
      summary('SPEC-0002', { owner: 'Bob', title: 'Cockpit dashboard', modules: ['developer-cockpit'] }),
      summary('SPEC-0003', { owner: ' alice ', title: 'Fix fills', modules: ['oms-core'], status: 'design' }),
    ];
    const ids = (ts: typeof tickets) => ts.map((t) => t.id);

    expect(isMine(tickets[2], 'Alice')).toBe(true);
    expect(isMine(tickets[0], '')).toBe(false);

    expect(ids(filterTickets(tickets, { ...ALL, user: 'Alice', mineOnly: true }))).toEqual(['SPEC-0001', 'SPEC-0003']);
    expect(ids(filterTickets(tickets, { ...ALL, user: 'Alice' }))).toEqual(['SPEC-0001', 'SPEC-0002', 'SPEC-0003']);
    expect(ids(filterTickets(tickets, { ...ALL, user: '', mineOnly: true }))).toEqual(['SPEC-0001', 'SPEC-0002', 'SPEC-0003']);

    expect(ids(filterTickets(tickets, { ...ALL, user: 'Alice', stage: 'design' }))).toEqual(['SPEC-0001', 'SPEC-0003']);
    expect(ids(filterTickets(tickets, { ...ALL, user: 'Alice', module: 'developer-cockpit' }))).toEqual(['SPEC-0002']);
    expect(ids(filterTickets(tickets, { ...ALL, user: 'Alice', text: 'FILLS' }))).toEqual(['SPEC-0003']);
    expect(ids(filterTickets(tickets, { ...ALL, user: 'Alice', text: '0002' }))).toEqual(['SPEC-0002']);
  });

  it('stageIndex uses blockedFrom for blocked tickets', () => {
    expect(stageIndex(summary('SPEC-0001', { status: 'proposal' }))).toBe(0);
    expect(stageIndex(summary('SPEC-0001', { status: 'done' }))).toBe(5);
    expect(stageIndex(summary('SPEC-0001', { status: 'blocked', blockedFrom: 'plan' }))).toBe(2);
  });

  it('summarize counts stages, awaiting, blocked and completion', () => {
    const tickets = [
      summary('SPEC-0001', { status: 'proposal', awaiting: 'proposal', owner: 'Bob' }),
      summary('SPEC-0002', { status: 'design', awaiting: 'design', owner: 'Alice' }),
      summary('SPEC-0003', { status: 'implement', tasks: { done: 3, total: 4 } }),
      summary('SPEC-0004', { status: 'implement', tasks: { done: 1, total: 4 } }),
      summary('SPEC-0005', { status: 'blocked', blockedFrom: 'plan', owner: 'Bob' }),
      summary('SPEC-0006', { status: 'blocked', blockedFrom: 'verify', owner: 'Alice' }),
      summary('SPEC-0007', { status: 'done', tasks: { done: 2, total: 2 } }),
      summary('SPEC-0008', { status: 'done', archived: true, tasks: { done: 10, total: 10 } }),
    ];

    const s = summarize(tickets, 'Alice');
    expect(Object.fromEntries(stageDistribution(tickets).shares.map((x) => [x.stage, x.count])))
      .toEqual({ proposal: 1, design: 1, implement: 2, done: 1, blocked: 2 });
    expect(s.awaiting.map((t) => t.id)).toEqual(['SPEC-0002', 'SPEC-0001']);
    expect(s.blocked.map((t) => t.id)).toEqual(['SPEC-0006', 'SPEC-0005']);
    expect(s.tasksDone).toBe(6);
    expect(s.tasksTotal).toBe(10);
    expect(s.completionPct).toBe(60);

    expect(summarize([summary('SPEC-0001')], 'Alice').completionPct).toBeNull();
  });

  it('stageDistribution orders, counts and excludes archived', () => {
    const at = (status: string, n: number, extra = {}) =>
      Array.from({ length: n }, (_, i) => summary(`SPEC-${status}-${i}`, { status: status as never, ...extra }));
    const tickets = [
      ...at('blocked', 1, { blockedFrom: 'plan' }), ...at('implement', 3), ...at('done', 1),
      ...at('proposal', 2), ...at('design', 1), ...at('verify', 4, { archived: true }),
    ];

    const d = stageDistribution(tickets);

    expect(d.total).toBe(8);
    expect(d.shares.map((s) => [s.stage, s.count, s.pct])).toEqual([
      ['proposal', 2, 25], ['design', 1, 12.5], ['implement', 3, 37.5], ['done', 1, 12.5], ['blocked', 1, 12.5],
    ]);
    expect(stageDistribution([])).toEqual({ total: 0, shares: [] });
  });

  it('summarize lists my tickets in progress', () => {
    const tickets = [
      summary('SPEC-0001', { owner: 'Alice', status: 'design' }),
      summary('SPEC-0002', { owner: 'Alice', status: 'done' }),
      summary('SPEC-0003', { owner: 'Bob', status: 'implement' }),
      summary('SPEC-0004', { owner: 'alice', status: 'blocked', blockedFrom: 'plan' }),
      summary('SPEC-0005', { owner: 'Alice', status: 'plan', archived: true }),
    ];
    expect(summarize(tickets, 'Alice').mineInProgress.map((t) => t.id)).toEqual(['SPEC-0001', 'SPEC-0004']);
    expect(summarize(tickets, '').mineInProgress).toEqual([]);
  });
});
