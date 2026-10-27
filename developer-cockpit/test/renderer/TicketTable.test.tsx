// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TicketTable } from '../../src/renderer/views/dashboard/TicketTable';
import { useSpecTicketsStore } from '../../src/renderer/stores/specTickets';
import { useNavigationStore } from '../../src/renderer/stores/navigation';
import { detail, mockCockpit, summary } from './ticket-fixtures';

const TICKETS = [
  summary('SPEC-0001', { title: 'Alice ticket', owner: 'Alice' }),
  summary('SPEC-0002', { title: 'Bob ticket', owner: 'Bob' }),
];

/** The Dashboard loads tickets (SpecOverview); the table only renders the store. */
async function renderLoaded() {
  render(<TicketTable />);
  await act(() => useSpecTicketsStore.getState().load());
}

describe('TicketTable (Dashboard)', () => {
  afterEach(() => {
    cleanup();
    useSpecTicketsStore.setState(useSpecTicketsStore.getInitialState(), true);
    useNavigationStore.setState({ activeView: 'dashboard' });
  });

  it('lists only my tickets by default and all after toggle', async () => {
    const api = mockCockpit();
    api.list.mockResolvedValue({ user: 'Alice', tickets: TICKETS, errors: [] });
    await renderLoaded();

    await screen.findByText('Alice ticket');
    expect(screen.queryByText('Bob ticket')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'All tickets' }));
    expect(screen.getByText('Alice ticket')).toBeTruthy();
    expect(screen.getByText('Bob ticket')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'My tickets' }));
    expect(screen.queryByText('Bob ticket')).toBeNull();
  });

  it('lists all tickets by default when no git user is configured', async () => {
    const api = mockCockpit();
    api.list.mockResolvedValue({ user: '', tickets: TICKETS, errors: [] });
    await renderLoaded();

    await screen.findByText('Alice ticket');
    expect(screen.getByText('Bob ticket')).toBeTruthy();
  });

  it('shows folders that failed to load as error rows', async () => {
    const api = mockCockpit();
    api.list.mockResolvedValue({
      user: 'Alice',
      tickets: [TICKETS[0]],
      errors: [{ dir: 'specs/changes/SPEC-0009-broken', error: 'ticket.md is missing' }],
    });
    await renderLoaded();

    await screen.findByText('Alice ticket');
    expect(screen.getByText(/SPEC-0009-broken/)).toBeTruthy();
    expect(screen.getByText(/ticket\.md is missing/)).toBeTruthy();
  });

  it('stage, module and search filters and show archived drive the table', async () => {
    // Radix Select needs these in jsdom.
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.releasePointerCapture ??= () => {};
    Element.prototype.scrollIntoView ??= () => {};
    const api = mockCockpit();
    const tickets = [
      summary('SPEC-0001', { title: 'Core fix', owner: 'Alice', status: 'design', modules: ['oms-core'] }),
      summary('SPEC-0002', { title: 'Cockpit work', owner: 'Alice', status: 'implement', modules: ['developer-cockpit'] }),
    ];
    api.list.mockImplementation(async (includeArchived: boolean) => ({
      user: 'Alice',
      tickets: includeArchived ? [...tickets, summary('SPEC-0003', { title: 'Old one', owner: 'Alice', status: 'done', archived: true })] : tickets,
      errors: [],
    }));
    await renderLoaded();
    const table = () => screen.getByRole('region', { name: 'Tickets' });
    const titles = () => within(table()).queryAllByRole('row').slice(1).map((r) => r.textContent ?? '');
    const pick = (trigger: string, option: string) => {
      fireEvent.keyDown(screen.getByRole('combobox', { name: trigger }), { key: 'Enter' });
      fireEvent.click(screen.getByRole('option', { name: option }));
    };

    pick('Stage filter', 'implement');
    expect(titles().join()).toContain('Cockpit work');
    expect(titles().join()).not.toContain('Core fix');
    pick('Stage filter', 'All stages');

    pick('Module filter', 'oms-core');
    expect(titles().join()).toContain('Core fix');
    expect(titles().join()).not.toContain('Cockpit work');
    pick('Module filter', 'All modules');

    fireEvent.change(screen.getByPlaceholderText('Search id or title'), { target: { value: '0002' } });
    expect(titles().join()).toContain('Cockpit work');
    expect(titles().join()).not.toContain('Core fix');
    fireEvent.change(screen.getByPlaceholderText('Search id or title'), { target: { value: '' } });

    expect(titles().join()).not.toContain('Old one');
    fireEvent.click(screen.getByRole('switch', { name: 'Show archived' }));
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(true));
    await waitFor(() => expect(titles().join()).toContain('Old one'));
  });

  it('opens a clicked ticket in Spec Tickets', async () => {
    const api = mockCockpit();
    api.list.mockResolvedValue({ user: 'Alice', tickets: TICKETS, errors: [] });
    await renderLoaded();

    fireEvent.click(await screen.findByText('Alice ticket'));
    await waitFor(() => expect(useNavigationStore.getState().activeView).toBe('spec-tickets'));
    expect(api.get).toHaveBeenCalledWith('SPEC-0001');
    expect(useSpecTicketsStore.getState().selectedId).toBe('SPEC-0001');
  });

  it('new ticket from the dashboard opens it in Spec Tickets', async () => {
    const api = mockCockpit();
    api.list.mockResolvedValue({ user: 'Alice', types: ['feature'], tickets: TICKETS, errors: [] });
    api.run.mockResolvedValue({ exitCode: 0, stdout: 'Created SPEC-0003 in specs/changes/SPEC-0003-x', stderr: '', awaitingApproval: false });
    api.get.mockResolvedValue(detail('SPEC-0003'));
    await renderLoaded();

    fireEvent.click(screen.getByRole('button', { name: /New ticket/ }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Reject zero qty' } });
    fireEvent.change(screen.getByLabelText('Modules (comma-separated)'), { target: { value: 'oms-core' } });
    fireEvent.change(screen.getByLabelText("Goal (the requester's words)"), { target: { value: 'Zero quantity is rejected.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }));

    await waitFor(() => expect(useNavigationStore.getState().activeView).toBe('spec-tickets'));
    expect(useSpecTicketsStore.getState().selectedId).toBe('SPEC-0003');
    expect(api.run).toHaveBeenCalledWith(expect.objectContaining({ kind: 'new', title: 'Reject zero qty' }));
  });
});
