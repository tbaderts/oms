// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { SignalsPanel } from '../../src/renderer/views/dashboard/SignalsPanel';
import { useSignalsStore } from '../../src/renderer/stores/signals';
import { summary } from './ticket-fixtures';

const TICKETS = [
  summary('SPEC-0001', {
    title: 'Alpha',
    recentLog: [
      '2026-10-30 08:00 — verify run: fail',
      '2026-10-30 08:01 — plan gate passed; awaiting human approval',
      '2026-10-30 08:02 — verify run: pass',
      '2026-10-30 08:03 — design → plan',
    ],
  }),
];

describe('SignalsPanel', () => {
  beforeEach(() => useSignalsStore.setState(useSignalsStore.getInitialState(), true));
  afterEach(cleanup);

  it('each activity entry shows a level icon and label (AC-2)', () => {
    render(<SignalsPanel tickets={TICKETS} user="Alice" unavailable={false} />);
    const rows = within(screen.getByRole('region', { name: 'Activity' })).getAllByRole('listitem');
    expect(rows.map((r) => r.getAttribute('data-level'))).toEqual(['info', 'good', 'attention', 'critical']);
    for (const row of rows) {
      const level = row.getAttribute('data-level')!;
      expect(row.querySelector(`[data-icon="${level}"]`), level).toBeTruthy();
      expect(within(row).getByText(level)).toBeTruthy();
      expect(row.textContent).toContain('SPEC-0001');
      expect(row.textContent).toContain('Alpha');
      expect(row.textContent).toMatch(/08:0\d/);
    }
    expect(rows[3].textContent).toContain('verify run: fail');
  });

  it('marks entries that arrived after the first load as new (AC-4)', () => {
    useSignalsStore.setState({ fresh: new Set(['SPEC-0001|2026-10-30 08:03 — design → plan|0']) });
    render(<SignalsPanel tickets={TICKETS} user="Alice" unavailable={false} />);
    const rows = within(screen.getByRole('region', { name: 'Activity' })).getAllByRole('listitem');
    expect(rows.map((r) => r.getAttribute('data-new'))).toEqual(['true', null, null, null]);
    expect(within(rows[0]).getByText('new')).toBeTruthy();
  });

  it('your turn empty state and no activity (AC-3)', () => {
    render(<SignalsPanel tickets={[summary('SPEC-0002')]} user="Alice" unavailable={false} />);
    expect(within(screen.getByRole('region', { name: 'Your turn' })).getByText('Nothing needs you.')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Activity' })).getByText('No activity yet.')).toBeTruthy();
  });

  it('says signals are unavailable instead of showing an empty state (AC-7)', () => {
    render(<SignalsPanel tickets={[]} user="Alice" unavailable />);
    expect(screen.getByText(/signals are unavailable/i)).toBeTruthy();
    expect(screen.queryByText('Nothing needs you.')).toBeNull();
    expect(screen.queryByText('No activity yet.')).toBeNull();
  });
});
