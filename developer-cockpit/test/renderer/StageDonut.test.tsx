// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { StageDonut } from '../../src/renderer/views/dashboard/StageDonut';
import { useSpecTicketsStore } from '../../src/renderer/stores/specTickets';
import type { SpecTicketSummary } from '../../src/shared/types/specTickets';
import { summary } from './ticket-fixtures';

function tickets(spec: Record<string, number>, extra: Partial<SpecTicketSummary> = {}) {
  return Object.entries(spec).flatMap(([status, n]) =>
    Array.from({ length: n }, (_, i) => summary(`SPEC-${status}-${i}`, {
      status: status as SpecTicketSummary['status'],
      ...(status === 'blocked' ? { blockedFrom: 'plan' } : {}),
      ...extra,
    })));
}

const legendItems = () =>
  within(screen.getByRole('list', { name: /legend/i })).getAllByRole('listitem')
    .map((li) => li.textContent?.replace(/\s+/g, ' ').trim());

describe('StageDonut', () => {
  beforeEach(() => useSpecTicketsStore.setState({ stage: '', mineOnly: true }));
  afterEach(cleanup);

  it('segments in pipeline order with proportional arcs, centre total, legend and text alternative (AC-1, AC-2)', () => {
    // 2 proposal, 1 design, 3 implement, 1 done, 1 blocked (+ 2 archived that must not count)
    render(<StageDonut tickets={[
      ...tickets({ blocked: 1, done: 1, implement: 3, design: 1, proposal: 2 }),
      ...tickets({ verify: 2 }, { archived: true }),
    ]} />);

    const chart = screen.getByRole('group', { name: /ticket progress/i });
    const segments = within(chart).getAllByTestId('stage-segment');
    expect(segments.map((s) => s.getAttribute('data-stage'))).toEqual(['proposal', 'design', 'implement', 'done', 'blocked']);
    const sweeps = segments.map((s) => parseFloat(s.getAttribute('data-sweep')!));
    [2, 1, 3, 1, 1].forEach((n, i) => expect(sweeps[i]).toBeCloseTo((360 * n) / 8, 5));
    // Colour comes from the theme tokens, never a hard-coded hex.
    expect(segments[2].getAttribute('fill')).toBe('var(--stage-implement)');
    expect(screen.getByTestId('donut-total').textContent).toBe('8');

    const label = chart.getAttribute('aria-label')!;
    expect(label).toContain('8 active tickets');
    expect(label).toContain('proposal 2 (25%)');
    expect(label).toContain('implement 3 (38%)');
    expect(label).toContain('blocked 1 (13%)');
    expect(label).not.toContain('verify');

    // Every colour is shown with its name and count (the low-contrast relief of AC-2).
    expect(legendItems()).toEqual(['proposal 2 · 25%', 'design 1 · 13%', 'implement 3 · 38%', 'done 1 · 13%', 'blocked 1 · 13%']);
    // Blocked is never colour alone: it carries an icon.
    const blocked = within(screen.getByRole('list', { name: /legend/i })).getAllByRole('listitem')[4];
    expect(blocked.querySelector('[data-icon="blocked"]')).toBeTruthy();
  });

  it('rounds each percentage once, from the raw share', () => {
    render(<StageDonut tickets={tickets({ design: 5, implement: 6 })} />);
    expect(legendItems()).toEqual(['design 5 · 45%', 'implement 6 · 55%']);
    expect(screen.getByRole('group', { name: /ticket progress/i }).getAttribute('aria-label')).toContain('design 5 (45%)');
  });

  it('shows stage, count and percentage on hover and on focus (AC-5)', () => {
    render(<StageDonut tickets={tickets({ proposal: 2, implement: 3 })} />);
    const implement = screen.getByRole('button', { name: 'implement: 3 of 5 (60%)' });

    fireEvent.mouseEnter(implement);
    expect(screen.getByRole('tooltip').textContent).toBe('implement3 of 5 · 60%');
    fireEvent.mouseLeave(implement);
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.focus(screen.getByRole('button', { name: 'proposal: 2 of 5 (40%)' }));
    expect(screen.getByRole('tooltip').textContent).toBe('proposal2 of 5 · 40%');
  });

  it('click, Enter and Space toggle the stage filter; the chip clears it (AC-4, AC-5)', () => {
    render(<StageDonut tickets={tickets({ proposal: 2, implement: 3 })} />);
    const implement = screen.getByRole('button', { name: 'implement: 3 of 5 (60%)' });

    fireEvent.click(implement);
    expect(useSpecTicketsStore.getState()).toMatchObject({ stage: 'implement', mineOnly: false });
    expect(implement.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('stage-filter-chip').textContent).toContain('implement');

    fireEvent.click(implement);
    expect(useSpecTicketsStore.getState().stage).toBe('');
    expect(screen.queryByTestId('stage-filter-chip')).toBeNull();

    fireEvent.keyDown(implement, { key: 'Enter' });
    expect(useSpecTicketsStore.getState().stage).toBe('implement');
    fireEvent.keyDown(implement, { key: ' ' });
    expect(useSpecTicketsStore.getState().stage).toBe('');

    // Legend entries filter the same way, and Clear removes the filter.
    fireEvent.click(screen.getByRole('button', { name: /^proposal 2/ }));
    expect(useSpecTicketsStore.getState().stage).toBe('proposal');
    fireEvent.click(within(screen.getByTestId('stage-filter-chip')).getByRole('button', { name: /clear/i }));
    expect(useSpecTicketsStore.getState().stage).toBe('');
  });

  it('the filter chip labels and colours the tiles cross-stage filters', () => {
    useSpecTicketsStore.setState({ stage: 'in-progress' });
    const { unmount } = render(<StageDonut tickets={tickets({ proposal: 2 })} />);
    let chip = screen.getByTestId('stage-filter-chip');
    expect(chip.textContent).toContain('In progress');
    // The dot keeps the accent of the tile that set the filter.
    expect(chip.querySelector('span')!.style.background).toBe('var(--stage-proposal)');
    unmount();

    useSpecTicketsStore.setState({ stage: 'awaiting' });
    render(<StageDonut tickets={tickets({ proposal: 2 })} />);
    chip = screen.getByTestId('stage-filter-chip');
    expect(chip.textContent).toContain('Awaiting approval');
    expect(chip.querySelector('span')!.style.background).toBe('var(--stage-plan)');
  });

  it('draws a single stage as a full ring', () => {
    render(<StageDonut tickets={tickets({ implement: 2 })} />);
    const [segment] = screen.getAllByTestId('stage-segment');
    expect(parseFloat(segment.getAttribute('data-sweep')!)).toBe(360);
    // Two half arcs: an SVG arc cannot span exactly 360°.
    expect(segment.getAttribute('d')!.match(/A/g)).toHaveLength(4);
  });

  it('empty state without active tickets (AC-6)', () => {
    render(<StageDonut tickets={tickets({ done: 2 }, { archived: true })} />);
    expect(screen.queryByRole('group', { name: /ticket progress/i })).toBeNull();
    expect(screen.getByText('No active tickets yet.')).toBeTruthy();
  });
});
