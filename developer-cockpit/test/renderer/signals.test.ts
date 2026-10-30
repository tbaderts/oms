import { describe, expect, it } from 'vitest';
import { classify, collectSignals, parseLogEntry, signalsOf } from '../../src/renderer/lib/signals';
import { summary } from './ticket-fixtures';

describe('parseLogEntry', () => {
  it('splits date, time and text', () => {
    expect(parseLogEntry('2026-10-30 06:24 — verify run: pass')).toEqual({ date: '2026-10-30', time: '06:24', text: 'verify run: pass' });
    expect(parseLogEntry('2026-10-30 created')).toEqual({ date: '2026-10-30', time: '', text: 'created' });
  });

  it('keeps unknown lines whole', () => {
    expect(parseLogEntry('something odd — here')).toEqual({ date: '', time: '', text: 'something odd — here' });
  });
});

describe('classify (AC-2)', () => {
  it.each([
    ['verify run: fail', 'critical'],
    ['blocked: needs a decision', 'critical'],
    ['reopened at implement: tests fail', 'critical'],
    ['autopilot switched off: no progress after 2 continuation prompts at stage plan', 'critical'],
    ['proposal gate passed; awaiting human approval', 'attention'],
    ['design gate passed; awaiting human approval (policy exceptions: P-17)', 'attention'],
    ['verify run: pass', 'good'],
    ['verify → done', 'good'],
    ['design → plan', 'info'],
    ['proposal approved by Alice', 'info'],
    ['autopilot on', 'info'],
    ['something the CLI may write one day', 'info'],
  ])('%s → %s', (text, level) => {
    expect(classify(text)).toBe(level);
  });
});

describe('collectSignals (AC-1, AC-7)', () => {
  const tickets = [
    summary('SPEC-0001', { title: 'Alpha', recentLog: ['2026-10-29 created', '2026-10-30 08:00 — design → plan', '2026-10-30 09:15 — verify run: fail'] }),
    summary('SPEC-0002', { title: 'Beta', recentLog: ['2026-10-30 08:00 — proposal gate passed; awaiting human approval', 'garbled line'] }),
    summary('SPEC-0003', { title: 'Old', archived: true, recentLog: ['2026-10-30 23:59 — archived'] }),
  ];

  it('merges the logs of non-archived tickets, newest first', () => {
    const signals = collectSignals(tickets);
    expect(signals.map((s) => `${s.ticketId} ${s.text}`)).toEqual([
      'SPEC-0001 verify run: fail',
      // Same minute: the later position in its own log wins, then the ticket id.
      'SPEC-0001 design → plan',
      'SPEC-0002 proposal gate passed; awaiting human approval',
      'SPEC-0001 created',
      'SPEC-0002 garbled line',
    ]);
    expect(signals[0]).toMatchObject({ title: 'Alpha', date: '2026-10-30', time: '09:15', level: 'critical' });
    // Unknown lines are info and keep their text.
    expect(signals[4]).toMatchObject({ level: 'info', text: 'garbled line', date: '', time: '' });
  });

  it('caps the feed at 20 entries', () => {
    const many = summary('SPEC-0009', {
      recentLog: Array.from({ length: 20 }, (_, i) => `2026-10-30 10:${String(i).padStart(2, '0')} — note ${i}`),
    });
    const signals = collectSignals([...tickets, many]);
    expect(signals).toHaveLength(20);
    expect(signals[0].text).toBe('note 19');
  });

  it('keys are stable and distinct for repeated lines', () => {
    const t = summary('SPEC-0001', { recentLog: ['2026-10-30 08:00 — autopilot on', '2026-10-30 08:00 — autopilot on'] });
    const keys = signalsOf(t).map((s) => s.key);
    expect(new Set(keys).size).toBe(2);
    // Dropping an older entry from the window does not change the remaining keys.
    const shifted = summary('SPEC-0001', { recentLog: ['2026-10-30 08:00 — autopilot on', '2026-10-30 08:00 — autopilot on', '2026-10-30 08:01 — autopilot off'] });
    expect(signalsOf(shifted).map((s) => s.key).slice(0, 2)).toEqual(keys);
  });
});
