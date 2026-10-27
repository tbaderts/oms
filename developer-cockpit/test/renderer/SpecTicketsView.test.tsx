// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { SpecTicketsView } from '../../src/renderer/views/spec-tickets/SpecTicketsView';
import { useSpecTicketsStore } from '../../src/renderer/stores/specTickets';
import { useNavigationStore } from '../../src/renderer/stores/navigation';
import { detail, mockCockpit, summary } from './ticket-fixtures';

const TICKETS = [
  summary('SPEC-0001', { title: 'Alice ticket', owner: 'Alice' }),
  summary('SPEC-0002', { title: 'Bob ticket', owner: 'Bob' }),
];

describe('SpecTicketsView (workspace)', () => {
  afterEach(() => {
    cleanup();
    useSpecTicketsStore.setState(useSpecTicketsStore.getInitialState(), true);
    useNavigationStore.setState({ activeView: 'dashboard' });
  });

  it('workspace has a header with switcher, New ticket and All tickets, and no list', async () => {
    const api = mockCockpit();
    api.list.mockResolvedValue({ user: 'Alice', tickets: TICKETS, errors: [] });
    api.get.mockResolvedValue(detail('SPEC-0001', { title: 'Alice ticket', goal: 'The goal of Alice.' }));
    useSpecTicketsStore.setState({ selectedId: 'SPEC-0001' });
    useNavigationStore.setState({ activeView: 'spec-tickets' });
    render(<SpecTicketsView />);

    await screen.findByText('The goal of Alice.');
    const header = screen.getByRole('banner', { name: 'Ticket workspace' });
    expect(within(header).getByRole('button', { name: /switch ticket/i })).toBeTruthy();
    expect(within(header).getByRole('button', { name: /New ticket/ })).toBeTruthy();
    // No ticket list pane any more: no table, no list filters.
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('button', { name: 'My tickets' })).toBeNull();
    expect(screen.queryByText('Bob ticket')).toBeNull();

    fireEvent.click(within(header).getByRole('button', { name: 'All tickets' }));
    expect(useNavigationStore.getState().activeView).toBe('dashboard');
  });

  it('without a selection shows the switcher and a Dashboard hint', async () => {
    const api = mockCockpit();
    api.list.mockResolvedValue({ user: 'Alice', tickets: TICKETS, errors: [] });
    useNavigationStore.setState({ activeView: 'spec-tickets' });
    render(<SpecTicketsView />);

    expect(await screen.findByText(/Pick a ticket above, or browse all tickets on the/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /switch ticket/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    expect(useNavigationStore.getState().activeView).toBe('dashboard');
  });
});
