// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { StageDistribution } from '../../src/renderer/views/dashboard/StageDistribution';
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

describe('StageDistribution', () => {
  afterEach(cleanup);

  it('segments, widths, legend and text alternative', () => {
    // 2 proposal, 1 design, 3 implement, 1 done, 1 blocked (+ 2 archived that must not count)
    render(<StageDistribution tickets={[
      ...tickets({ proposal: 2, design: 1, implement: 3, done: 1, blocked: 1 }),
      ...tickets({ verify: 2 }, { archived: true }),
    ]} />);

    const bar = screen.getByRole('img', { name: /stage distribution/i });
    const segments = within(bar).getAllByTestId('stage-segment');
    expect(segments.map((s) => s.getAttribute('data-stage'))).toEqual(['proposal', 'design', 'implement', 'done', 'blocked']);
    const widths = segments.map((s) => parseFloat(s.style.flexGrow));
    const total = widths.reduce((a, b) => a + b, 0);
    const expected = [2, 1, 3, 1, 1].map((n) => (100 * n) / 8);
    widths.forEach((w, i) => expect(Math.abs((100 * w) / total - expected[i])).toBeLessThanOrEqual(1));
    // Colour comes from the theme tokens, never a hard-coded hex.
    expect(segments[2].style.background).toBe('var(--stage-implement)');

    // Text alternative lists the same numbers.
    const label = bar.getAttribute('aria-label')!;
    expect(label).toContain('8 active tickets');
    expect(label).toContain('proposal 2 (25%)');
    expect(label).toContain('implement 3 (38%)');
    expect(label).toContain('blocked 1 (13%)');
    expect(label).not.toContain('verify');

    // Legend: every non-empty stage with count and rounded percentage, in text (not colour) tokens.
    const legend = screen.getByRole('list', { name: /legend/i });
    const items = within(legend).getAllByRole('listitem').map((li) => li.textContent?.replace(/\s+/g, ' ').trim());
    expect(items).toEqual(['proposal 2 · 25%', 'design 1 · 13%', 'implement 3 · 38%', 'done 1 · 13%', 'blocked 1 · 13%']);
    // Blocked is never colour alone: it carries an icon.
    expect(within(legend).getAllByRole('listitem')[4].querySelector('svg')).toBeTruthy();
    // Each segment explains itself on hover.
    expect(segments[0].getAttribute('title')).toBe('proposal: 2 of 8 (25%)');
  });

  it('rounds each percentage once, from the raw share', () => {
    // 5/11 = 45.45% must read 45%, not 46% (rounding 45.5 again); 6/11 = 54.55% reads 55%.
    render(<StageDistribution tickets={tickets({ design: 5, implement: 6 })} />);
    const items = within(screen.getByRole('list', { name: /legend/i })).getAllByRole('listitem').map((li) => li.textContent?.replace(/\s+/g, ' ').trim());
    expect(items).toEqual(['design 5 · 45%', 'implement 6 · 55%']);
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('design 5 (45%)');
    expect(within(screen.getByRole('img')).getAllByTestId('stage-segment')[0].getAttribute('title')).toBe('design: 5 of 11 (45%)');
  });

  it('empty state without active tickets', () => {
    render(<StageDistribution tickets={tickets({ done: 2 }, { archived: true })} />);
    expect(screen.queryByRole('img', { name: /stage distribution/i })).toBeNull();
    expect(screen.getByText('No active tickets yet.')).toBeTruthy();
  });
});
