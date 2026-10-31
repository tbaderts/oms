// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ActivityBar, YourTurn } from '../../src/renderer/views/dashboard/Signals';
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

const bar = () => screen.getByRole('button', { name: /^Activity/ });
const rows = () => within(screen.getByRole('region', { name: 'Activity' })).getAllByRole('listitem');

describe('Signals', () => {
  beforeEach(() => useSignalsStore.setState(useSignalsStore.getInitialState(), true));
  afterEach(cleanup);

  it('activity starts collapsed with a summary of the latest entry (AC-2)', () => {
    useSignalsStore.setState({
      fresh: new Set(['SPEC-0001|2026-10-30 08:03 — design → plan|0', 'SPEC-0001|2026-10-30 08:02 — verify run: pass|0']),
    });
    render(<ActivityBar tickets={TICKETS} />);
    expect(bar().getAttribute('aria-expanded')).toBe('false');
    // No aria-controls while the feed is not in the DOM.
    expect(bar().hasAttribute('aria-controls')).toBe(false);
    expect(bar().textContent).toContain('2 new');
    expect(bar().textContent).toContain('info');
    expect(bar().textContent).toContain('08:03');
    expect(bar().textContent).toContain('SPEC-0001');
    expect(bar().textContent).toContain('design → plan');
    expect(screen.queryByRole('region', { name: 'Activity' })).toBeNull();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('clicking the bar expands and collapses the feed (AC-3)', () => {
    useSignalsStore.setState({ fresh: new Set(['SPEC-0001|2026-10-30 08:03 — design → plan|0']) });
    render(<ActivityBar tickets={TICKETS} />);

    fireEvent.click(bar());
    expect(bar().getAttribute('aria-expanded')).toBe('true');
    expect(useSignalsStore.getState().activityExpanded).toBe(true);
    expect(bar().getAttribute('aria-controls')).toBe(screen.getByRole('region', { name: 'Activity' }).id);
    expect(rows().map((r) => r.getAttribute('data-level'))).toEqual(['info', 'good', 'attention', 'critical']);
    expect(rows().map((r) => r.getAttribute('data-new'))).toEqual(['true', null, null, null]);
    for (const row of rows()) {
      const level = row.getAttribute('data-level')!;
      expect(row.querySelector(`[data-icon="${level}"]`), level).toBeTruthy();
      expect(within(row).getByText(level)).toBeTruthy();
      expect(row.textContent).toContain('Alpha');
    }

    fireEvent.click(bar());
    expect(bar().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('region', { name: 'Activity' })).toBeNull();
  });

  it('no activity: a plain row, nothing to expand (AC-6)', () => {
    render(<ActivityBar tickets={[summary('SPEC-0002')]} />);
    expect(screen.getByText('No activity yet.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('your turn empty state', () => {
    render(<YourTurn tickets={[summary('SPEC-0002')]} user="Alice" />);
    expect(within(screen.getByRole('region', { name: 'Your turn' })).getByText('Nothing needs you.')).toBeTruthy();
  });
});
