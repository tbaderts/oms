// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { DashboardView } from '../../src/renderer/views/dashboard/DashboardView';
import { eventBus } from '../../src/renderer/lib/event-bus';
import { useSpecTicketsStore } from '../../src/renderer/stores/specTickets';
import { useNavigationStore } from '../../src/renderer/stores/navigation';
import { useSignalsStore } from '../../src/renderer/stores/signals';
import { SignalsWatcher } from '../../src/renderer/components/SignalsWatcher';
import { mockCockpit, summary } from './ticket-fixtures';

class FakeWebSocket {
  static last: FakeWebSocket | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { FakeWebSocket.last = this; }
  close() {}
}

const TICKETS = [
  summary('SPEC-0001', { title: 'Bob waits', status: 'proposal', awaiting: 'proposal', owner: 'Bob' }),
  summary('SPEC-0002', { title: 'Alice waits', status: 'design', awaiting: 'design', owner: 'Alice' }),
  summary('SPEC-0003', { title: 'Building', status: 'implement', owner: 'Alice', tasks: { done: 3, total: 4 } }),
  summary('SPEC-0004', { title: 'Stuck', status: 'blocked', blockedFrom: 'plan', blockedReason: 'needs input', owner: 'Bob' }),
  summary('SPEC-0005', { title: 'Shipped', status: 'done', owner: 'Alice', tasks: { done: 2, total: 6 } }),
];

/** The KPI tile with the given label (a group named by its label). */
const tile = (label: string) => screen.getByRole('group', { name: label });
const tileValue = (label: string) => within(tile(label)).getByTestId('kpi-value').textContent;
const tableIds = () =>
  within(screen.getByRole('region', { name: 'Tickets' })).queryAllByText(/^SPEC-\d{4}$/).map((e) => e.textContent);

describe('Dashboard', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    eventBus.connect('ws://test');
  });
  afterEach(() => {
    cleanup();
    eventBus.disconnect();
    vi.unstubAllGlobals();
    useSpecTicketsStore.setState(useSpecTicketsStore.getInitialState(), true);
    useNavigationStore.setState({ activeView: 'dashboard' });
    useSignalsStore.setState(useSignalsStore.getInitialState(), true);
  });

  it('shows the portfolio and no quick links or getting started', async () => {
    const api = mockCockpit();
    api.list.mockResolvedValue({ user: 'Alice', tickets: TICKETS, errors: [] });
    render(<DashboardView />);
    await screen.findAllByText('Alice waits');

    expect(screen.queryByText('Getting Started')).toBeNull();
    for (const quickLink of ['Knowledge Base', 'Requirements', 'File Explorer', 'Contracts', 'Monitoring', 'Settings']) {
      expect(screen.queryByText(quickLink), quickLink).toBeNull();
    }
    expect(screen.getByRole('group', { name: /ticket progress of 5 active tickets/i })).toBeTruthy();
    expect(tileValue('Task completion')).toBe('50%');
    // The table's stage cell carries the same stage colour as the donut.
    const dots = within(screen.getByRole('region', { name: 'Tickets' })).getAllByTestId('stage-dot');
    expect(dots.map((d) => d.style.background)).toContain('var(--stage-implement)');
    expect(screen.getByRole('region', { name: 'Tickets' })).toBeTruthy();
  });

  it('ticket progress card holds donut, your turn and activity', async () => {
    const api = mockCockpit();
    api.list.mockResolvedValue({
      user: 'Alice',
      tickets: TICKETS.map((t) => (t.id === 'SPEC-0003' ? { ...t, recentLog: ['2026-10-30 09:00 — verify run: fail'] } : t)),
      errors: [],
    });
    render(<DashboardView />);
    await screen.findAllByText('Alice waits');

    const card = screen.getByRole('region', { name: 'Ticket progress' });
    expect(within(card).getByRole('group', { name: /ticket progress of 5 active tickets/i })).toBeTruthy();
    expect(within(card).getByRole('region', { name: 'Your turn' })).toBeTruthy();
    expect(within(card).getByRole('button', { name: /^Activity/ }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('region', { name: 'Signals' })).toBeNull();
  });

  it('activity stays expanded after leaving and returning', async () => {
    const api = mockCockpit();
    api.list.mockResolvedValue({
      user: 'Alice',
      tickets: TICKETS.map((t) => (t.id === 'SPEC-0003' ? { ...t, recentLog: ['2026-10-30 09:00 — verify run: fail'] } : t)),
      errors: [],
    });
    render(<DashboardView />);
    await screen.findAllByText('Alice waits');
    fireEvent.click(screen.getByRole('button', { name: /^Activity/ }));

    cleanup();
    render(<DashboardView />);
    await screen.findAllByText('Alice waits');
    expect(screen.getByRole('button', { name: /^Activity/ }).getAttribute('aria-expanded')).toBe('true');
    expect(within(screen.getByRole('region', { name: 'Activity' })).getAllByRole('listitem')).toHaveLength(1);
  });

  it('signals feed lists entries newest first when expanded', async () => {
    const api = mockCockpit();
    api.list.mockResolvedValue({
      user: 'Alice',
      tickets: [
        ...TICKETS.map((t) => (t.id === 'SPEC-0003' ? { ...t, recentLog: ['2026-10-30 08:00 — design → plan', '2026-10-30 09:00 — verify run: fail'] } : t)),
        summary('SPEC-0009', { title: 'Old', status: 'done', archived: true, recentLog: ['2026-10-30 10:00 — archived'] }),
      ],
      errors: [],
    });
    render(<DashboardView />);
    await screen.findAllByText('Alice waits');

    expect(screen.queryByRole('region', { name: 'Needs me' })).toBeNull();
    expect(screen.queryByText('Mine in progress')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Activity/ }));
    const rows = within(screen.getByRole('region', { name: 'Activity' })).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringMatching(/09:00.*SPEC-0003.*Building.*verify run: fail/),
      expect.stringMatching(/08:00.*SPEC-0003.*Building.*design → plan/),
    ]);
  });

  it('your turn lists awaiting and blocked, mine first, and opens tickets', async () => {
    const api = mockCockpit();
    // Alice (the git user) owns one awaiting and one blocked ticket; Bob owns the others.
    const mineBlocked = summary('SPEC-0008', { title: 'Mine stuck', status: 'blocked', blockedFrom: 'design', blockedReason: 'waiting for data', owner: 'Alice' });
    api.list.mockResolvedValue({ user: 'Alice', tickets: [...TICKETS, mineBlocked], errors: [] });
    render(<DashboardView />);
    await screen.findAllByText('Alice waits');
    const yourTurn = screen.getByRole('region', { name: 'Your turn' });
    const entries = within(yourTurn).getAllByRole('button');

    // The user's own entries come first across both kinds; awaiting before blocked within each owner.
    expect(entries.map((b) => b.textContent?.match(/SPEC-\d{4}/)?.[0])).toEqual(['SPEC-0002', 'SPEC-0008', 'SPEC-0001', 'SPEC-0004']);
    expect(entries[0].textContent).toContain('approve design');
    expect(entries[1].textContent).toContain('waiting for data');
    expect(entries[2].textContent).toContain('approve proposal');
    expect(entries[3].textContent).toContain('needs input');

    fireEvent.click(entries[2]);
    await waitFor(() => expect(useSpecTicketsStore.getState().selectedId).toBe('SPEC-0001'));
    expect(useNavigationStore.getState().activeView).toBe('spec-tickets');

    cleanup();
    api.list.mockResolvedValue({ user: 'Alice', tickets: [TICKETS[4]], errors: [] });
    render(<DashboardView />);
    expect(await screen.findByText('Nothing needs you.')).toBeTruthy();
  });

  it('clicking a table row or Your turn entry opens the ticket', async () => {
    const api = mockCockpit();
    api.list.mockResolvedValue({ user: 'Alice', tickets: TICKETS, errors: [] });
    render(<DashboardView />);
    await screen.findAllByText('Alice waits');

    fireEvent.click(within(screen.getByRole('region', { name: 'Your turn' })).getByText(/needs input/));
    await waitFor(() => expect(useNavigationStore.getState().activeView).toBe('spec-tickets'));
    expect(useSpecTicketsStore.getState().selectedId).toBe('SPEC-0004');

    useNavigationStore.setState({ activeView: 'dashboard' });
    fireEvent.click(within(screen.getByRole('region', { name: 'Tickets' })).getByText('Building'));
    await waitFor(() => expect(useSpecTicketsStore.getState().selectedId).toBe('SPEC-0003'));
    expect(useNavigationStore.getState().activeView).toBe('spec-tickets');
  });

  it('shows load errors instead of an empty portfolio', async () => {
    const api = mockCockpit();
    api.list.mockRejectedValue(new Error('spec CLI returned no JSON for "list" (exit 1)'));
    render(<DashboardView />);

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('spec CLI returned no JSON');
    // The overview does not present the failed load as an empty portfolio.
    expect(screen.queryByText('No active tickets yet.')).toBeNull();
    expect(screen.getByText('Tickets could not be loaded.')).toBeTruthy();
    expect(tileValue('Active tickets')).toBe('–');
    expect(screen.getByText(/signals are unavailable/i)).toBeTruthy();
    expect(screen.queryByText('Nothing needs you.')).toBeNull();
    expect(screen.queryByText('No activity yet.')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Activity/ })).toBeNull();
  });

  it('KPI tiles show active, in progress, awaiting, blocked, done and task completion', async () => {
    const api = mockCockpit();
    // 3 of 10 tasks done across the active tickets; the archived ticket does not count.
    const tickets = [
      ...TICKETS.map((t) => (t.id === 'SPEC-0003' ? { ...t, tasks: { done: 1, total: 4 } } : t)),
      summary('SPEC-0009', { title: 'Old', status: 'done', archived: true, tasks: { done: 7, total: 7 } }),
    ];
    api.list.mockResolvedValue({ user: 'Alice', tickets, errors: [] });
    render(<DashboardView />);
    await screen.findAllByText('Alice waits');

    expect(tileValue('Active tickets')).toBe('5');
    expect(tileValue('In progress')).toBe('4');
    expect(tileValue('Awaiting approval')).toBe('2');
    expect(tileValue('Blocked')).toBe('1');
    expect(tileValue('Done')).toBe('1');
    expect(tileValue('Task completion')).toBe('30%');
    expect(tile('Task completion').textContent).toContain('3 of 10 tasks');

    const labels = ['Active tickets', 'In progress', 'Awaiting approval', 'Blocked', 'Done', 'Task completion'];
    const accents = labels.map((l) => tile(l).getAttribute('data-accent'));
    expect(accents.every(Boolean)).toBe(true);
    expect(new Set(accents).size).toBe(labels.length);
    // Blocked is never colour alone.
    expect(tile('Blocked').querySelector('[data-icon="blocked"]')).toBeTruthy();
  });

  it('clicking a donut segment, legend entry or tile filters the ticket table and Clear resets it', async () => {
    const api = mockCockpit();
    api.list.mockResolvedValue({ user: 'Alice', tickets: TICKETS, errors: [] });
    render(<DashboardView />);
    await screen.findAllByText('Alice waits');
    const all = ['SPEC-0001', 'SPEC-0002', 'SPEC-0003', 'SPEC-0004', 'SPEC-0005'];

    const implement = screen.getByRole('button', { name: 'implement: 1 of 5 (20%)' });
    fireEvent.click(implement);
    expect(tableIds()).toEqual(['SPEC-0003']);
    expect(screen.getByTestId('stage-filter-chip').textContent).toContain('implement');
    fireEvent.click(implement);
    expect(tableIds()).toEqual(all);
    expect(screen.queryByTestId('stage-filter-chip')).toBeNull();

    fireEvent.click(within(screen.getByRole('list', { name: /legend/i })).getByRole('button', { name: /^proposal/ }));
    expect(tableIds()).toEqual(['SPEC-0001']);
    fireEvent.click(screen.getByRole('button', { name: /clear stage filter/i }));
    expect(tableIds()).toEqual(all);

    fireEvent.click(within(tile('Blocked')).getByRole('button'));
    expect(tableIds()).toEqual(['SPEC-0004']);
    expect(within(tile('Blocked')).getByRole('button').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(tile('Blocked')).getByRole('button'));
    expect(tableIds()).toEqual(all);
    expect(within(tile('Blocked')).getByRole('button').getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(within(tile('Done')).getByRole('button'));
    expect(tableIds()).toEqual(['SPEC-0005']);
    fireEvent.click(within(tile('Done')).getByRole('button'));
    expect(tableIds()).toEqual(all);
  });

  it('the Active, In progress and Awaiting approval tiles filter the table; Task completion does not', async () => {
    const api = mockCockpit();
    api.list.mockResolvedValue({ user: 'Alice', tickets: TICKETS, errors: [] });
    render(<DashboardView />);
    await screen.findAllByText('Alice waits');
    const all = ['SPEC-0001', 'SPEC-0002', 'SPEC-0003', 'SPEC-0004', 'SPEC-0005'];
    // Default: My tickets, so only Alice's.
    expect(tableIds()).toEqual(['SPEC-0002', 'SPEC-0003', 'SPEC-0005']);

    // Active tickets clears the stage filter and shows everyone's tickets.
    fireEvent.click(within(tile('Active tickets')).getByRole('button'));
    expect(tableIds()).toEqual(all);
    expect(within(tile('Active tickets')).getByRole('button').getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByTestId('stage-filter-chip')).toBeNull();

    // In progress: every non-done ticket, blocked included.
    fireEvent.click(within(tile('In progress')).getByRole('button'));
    expect(tableIds()).toEqual(['SPEC-0001', 'SPEC-0002', 'SPEC-0003', 'SPEC-0004']);
    expect(screen.getByTestId('stage-filter-chip').textContent).toContain('In progress');

    // Awaiting approval: tickets waiting on a stage approval.
    fireEvent.click(within(tile('Awaiting approval')).getByRole('button'));
    expect(tableIds()).toEqual(['SPEC-0001', 'SPEC-0002']);
    expect(screen.getByTestId('stage-filter-chip').textContent).toContain('Awaiting approval');

    // Task completion stays a static tile.
    expect(within(tile('Task completion')).queryByRole('button')).toBeNull();
  });

  it('clicking In progress or Awaiting approval again removes the filter', async () => {
    const api = mockCockpit();
    api.list.mockResolvedValue({ user: 'Alice', tickets: TICKETS, errors: [] });
    render(<DashboardView />);
    await screen.findAllByText('Alice waits');
    const all = ['SPEC-0001', 'SPEC-0002', 'SPEC-0003', 'SPEC-0004', 'SPEC-0005'];

    for (const label of ['In progress', 'Awaiting approval']) {
      const button = () => within(tile(label)).getByRole('button');
      fireEvent.click(button());
      expect(screen.getByTestId('stage-filter-chip').textContent, label).toContain(label);

      fireEvent.click(button());
      expect(tableIds(), label).toEqual(all);
      expect(screen.queryByTestId('stage-filter-chip'), label).toBeNull();
      expect(button().getAttribute('aria-pressed'), label).toBe('false');
    }
  });

  it("the stage select's cross-stage views list the same tickets as their tiles", async () => {
    const api = mockCockpit();
    api.list.mockResolvedValue({ user: 'Alice', tickets: TICKETS, errors: [] });
    render(<DashboardView />);
    await screen.findAllByText('Alice waits');
    const pick = (option: string) => {
      fireEvent.keyDown(screen.getByRole('combobox', { name: 'Stage filter' }), { key: 'Enter' });
      fireEvent.click(screen.getByRole('option', { name: option }));
    };
    // AC-5's Given: All tickets. The select keeps the My/All mode; a tile click switches to All.
    fireEvent.click(screen.getByRole('button', { name: 'All tickets' }));

    for (const [label, accent] of [['In progress', 'var(--stage-proposal)'], ['Awaiting approval', 'var(--stage-plan)']]) {
      const button = within(tile(label)).getByRole('button');
      fireEvent.click(button);
      const fromTile = tableIds();
      fireEvent.click(button);

      pick(label);
      expect(tableIds(), label).toEqual(fromTile);
      const chip = screen.getByTestId('stage-filter-chip');
      expect(chip.textContent, label).toContain(label);
      expect(chip.querySelector('span')!.style.background, label).toBe(accent);
      pick('All stages');
    }
  });

  it('empty portfolio shows no-active-tickets and zero tiles', async () => {
    const api = mockCockpit();
    api.list.mockResolvedValue({ user: 'Alice', tickets: [], errors: [] });
    render(<DashboardView />);

    expect(await screen.findByText('No active tickets yet.')).toBeTruthy();
    for (const label of ['Active tickets', 'In progress', 'Awaiting approval', 'Blocked', 'Done']) {
      expect(tileValue(label), label).toBe('0');
    }
    expect(tileValue('Task completion')).toBe('–');
  });

  it('live refresh updates donut, legend and tiles', async () => {
    const api = mockCockpit();
    api.list.mockResolvedValue({ user: 'Alice', tickets: TICKETS, errors: [] });
    // The live refresh is app-wide (SignalsWatcher in App), as in the running cockpit.
    render(<><SignalsWatcher /><DashboardView /></>);
    await screen.findAllByText('Alice waits');

    api.list.mockResolvedValue({
      user: 'Alice',
      tickets: [...TICKETS, summary('SPEC-0006', { title: 'Brand new', status: 'proposal', owner: 'Alice' })],
      errors: [],
    });
    FakeWebSocket.last!.onmessage!({ data: JSON.stringify({ type: 'specs:tickets-changed', timestamp: Date.now(), payload: { path: 'x' } }) });

    await screen.findByRole('group', { name: /6 active tickets/ });
    expect(screen.getByTestId('donut-total').textContent).toBe('6');
    expect(within(screen.getByRole('list', { name: /legend/i })).getByRole('button', { name: /^proposal/ }).textContent).toContain('2 · 33%');
    expect(tileValue('Active tickets')).toBe('6');
    expect(tileValue('In progress')).toBe('5');
    expect(within(screen.getByRole('region', { name: 'Tickets' })).getByText('Brand new')).toBeTruthy();
  });

  it('live refresh adds a new activity entry marked new', async () => {
    const api = mockCockpit();
    const before = TICKETS.map((t) => (t.id === 'SPEC-0003' ? { ...t, recentLog: ['2026-10-30 08:00 — design → plan'] } : t));
    api.list.mockResolvedValue({ user: 'Alice', tickets: before, errors: [] });
    render(<><SignalsWatcher /><DashboardView /></>);
    await screen.findAllByText('Alice waits');
    await waitFor(() => expect(useSignalsStore.getState().initialized).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: /^Activity/ }));
    const activity = () => within(screen.getByRole('region', { name: 'Activity' })).getAllByRole('listitem');
    expect(activity().map((r) => r.getAttribute('data-new'))).toEqual([null]);

    api.list.mockResolvedValue({
      user: 'Alice',
      tickets: before.map((t) => (t.id === 'SPEC-0003' ? { ...t, recentLog: [...t.recentLog, '2026-10-30 08:30 — plan → implement'] } : t)),
      errors: [],
    });
    FakeWebSocket.last!.onmessage!({ data: JSON.stringify({ type: 'specs:tickets-changed', timestamp: Date.now(), payload: { path: 'x' } }) });

    await waitFor(() => expect(activity()).toHaveLength(2));
    expect(activity()[0].textContent).toContain('plan → implement');
    expect(activity().map((r) => r.getAttribute('data-new'))).toEqual(['true', null]);
    // The refresh does not collapse the feed.
    expect(screen.getByRole('button', { name: /^Activity/ }).getAttribute('aria-expanded')).toBe('true');
  });
});
