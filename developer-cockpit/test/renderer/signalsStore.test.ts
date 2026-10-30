import { beforeEach, describe, expect, it } from 'vitest';
import { useSignalsStore } from '../../src/renderer/stores/signals';
import { summary } from './ticket-fixtures';

const BASE = ['2026-10-30 08:00 — proposal → design', '2026-10-30 08:05 — verify run: fail'];
const ticket = (log: string[], extra = {}) => summary('SPEC-0001', { title: 'Alpha', recentLog: log, ...extra });
const s = () => useSignalsStore.getState();

describe('signals store', () => {
  beforeEach(() => useSignalsStore.setState(useSignalsStore.getInitialState(), true));

  it('first ingest marks nothing new; later entries are fresh (AC-4)', () => {
    s().ingest([ticket(BASE)]);
    expect(s().initialized).toBe(true);
    expect(s().fresh.size).toBe(0);
    expect(s().unseen).toEqual([]);
    expect(s().toasts).toEqual([]);

    s().ingest([ticket([...BASE, '2026-10-30 08:10 — design → plan'])]);
    expect([...s().fresh]).toEqual(['SPEC-0001|2026-10-30 08:10 — design → plan|0']);
  });

  it('only new critical and attention entries become unseen and toasts (AC-5, AC-6)', () => {
    s().ingest([ticket(BASE)]);
    s().ingest([ticket([
      ...BASE,
      '2026-10-30 08:10 — verify run: pass',
      '2026-10-30 08:11 — design → plan',
      '2026-10-30 08:12 — blocked: needs input',
      '2026-10-30 08:13 — plan gate passed; awaiting human approval',
    ])]);
    expect(s().unseen.map((x) => x.text)).toEqual(['plan gate passed; awaiting human approval', 'blocked: needs input']);
    expect(s().toasts.map((x) => x.text)).toEqual(['blocked: needs input', 'plan gate passed; awaiting human approval']);
  });

  it('orders a batch of new signals from several tickets by time', () => {
    const t1 = (log: string[]) => summary('SPEC-0001', { recentLog: log });
    const t2 = (log: string[]) => summary('SPEC-0002', { recentLog: log });
    s().ingest([t1([]), t2([])]);
    s().ingest([t1(['2026-10-30 08:20 — blocked: late']), t2(['2026-10-30 08:10 — verify run: fail'])]);
    expect(s().unseen.map((x) => x.text)).toEqual(['blocked: late', 'verify run: fail']);
    expect(s().toasts.map((x) => x.text)).toEqual(['verify run: fail', 'blocked: late']);
  });

  it('keeps at most 3 toasts, the latest ones', () => {
    s().ingest([ticket([])]);
    s().ingest([ticket(['1', '2', '3', '4'].map((n) => `2026-10-30 08:0${n} — blocked: reason ${n}`))]);
    expect(s().unseen).toHaveLength(4);
    expect(s().toasts.map((x) => x.text)).toEqual(['blocked: reason 2', 'blocked: reason 3', 'blocked: reason 4']);
  });

  it('re-ingesting the same tickets adds nothing, and entries leaving the window stay known', () => {
    s().ingest([ticket(BASE)]);
    s().ingest([ticket(BASE)]);
    expect(s().fresh.size).toBe(0);
    // The oldest entry leaves the window and a new one arrives: only the new one is fresh.
    s().ingest([ticket([BASE[1], '2026-10-30 09:00 — autopilot on'])]);
    expect([...s().fresh]).toEqual(['SPEC-0001|2026-10-30 09:00 — autopilot on|0']);
  });

  it('ignores archived tickets', () => {
    s().ingest([]);
    s().ingest([ticket(['2026-10-30 08:00 — blocked: x'], { archived: true })]);
    expect(s().unseen).toEqual([]);
  });

  it('markSeen clears the unseen list; dismissToast removes one toast', () => {
    s().ingest([]);
    s().ingest([ticket(['2026-10-30 08:00 — blocked: a', '2026-10-30 08:01 — verify run: fail'])]);
    s().dismissToast(s().toasts[0].key);
    expect(s().toasts.map((x) => x.text)).toEqual(['verify run: fail']);
    s().markSeen();
    expect(s().unseen).toEqual([]);
    expect(s().fresh.size).toBe(2);
  });
});
