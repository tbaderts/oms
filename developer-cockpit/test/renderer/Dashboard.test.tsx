// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { DashboardView } from '../../src/renderer/views/dashboard/DashboardView';
import { eventBus } from '../../src/renderer/lib/event-bus';
import { useSpecTicketsStore } from '../../src/renderer/stores/specTickets';
import { useNavigationStore } from '../../src/renderer/stores/navigation';
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
    expect(screen.getByRole('img', { name: /stage distribution of 5 active tickets/i })).toBeTruthy();
    expect(screen.getByText('Task completion')).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Needs me' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Tickets' })).toBeTruthy();
  });

  it('Needs me groups awaiting, blocked and mine in progress', async () => {
    const api = mockCockpit();
    api.list.mockResolvedValue({ user: 'Alice', tickets: TICKETS, errors: [] });
    render(<DashboardView />);
    await screen.findAllByText('Alice waits');
    const needsMe = screen.getByRole('region', { name: 'Needs me' });
    const ids = (label: string) => within(within(needsMe).getByLabelText(label)).queryAllByRole('button').map((b) => b.textContent?.match(/SPEC-\d{4}/)?.[0]);

    expect(ids('Awaiting approval')).toEqual(['SPEC-0002', 'SPEC-0001']);
    expect(ids('Blocked')).toEqual(['SPEC-0004']);
    expect(ids('Mine in progress')).toEqual(['SPEC-0002', 'SPEC-0003']);
    expect(within(within(needsMe).getByLabelText('Blocked')).getByText(/needs input/)).toBeTruthy();

    cleanup();
    api.list.mockResolvedValue({ user: 'Alice', tickets: [TICKETS[4]], errors: [] });
    render(<DashboardView />);
    await screen.findByText('Nothing waiting for approval.');
    expect(screen.getByText('Nothing blocked.')).toBeTruthy();
    expect(screen.getByText('None of your tickets is in progress.')).toBeTruthy();
  });

  it('clicking a table row or Needs me entry opens the ticket', async () => {
    const api = mockCockpit();
    api.list.mockResolvedValue({ user: 'Alice', tickets: TICKETS, errors: [] });
    render(<DashboardView />);
    await screen.findAllByText('Alice waits');

    fireEvent.click(within(screen.getByLabelText('Blocked')).getByRole('button'));
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
  });

  it('live refresh updates chart, needs me and table', async () => {
    const api = mockCockpit();
    api.list.mockResolvedValue({ user: 'Alice', tickets: TICKETS, errors: [] });
    render(<DashboardView />);
    await screen.findAllByText('Alice waits');

    api.list.mockResolvedValue({
      user: 'Alice',
      tickets: [...TICKETS, summary('SPEC-0006', { title: 'Brand new', status: 'proposal', owner: 'Alice' })],
      errors: [],
    });
    FakeWebSocket.last!.onmessage!({ data: JSON.stringify({ type: 'specs:tickets-changed', timestamp: Date.now(), payload: { path: 'x' } }) });

    await screen.findByRole('img', { name: /6 active tickets/ });
    expect(within(screen.getByRole('region', { name: 'Tickets' })).getByText('Brand new')).toBeTruthy();
    expect(within(screen.getByLabelText('Mine in progress')).getByText('Brand new')).toBeTruthy();
  });
});
