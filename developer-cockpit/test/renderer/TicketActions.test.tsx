// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TicketActions } from '../../src/renderer/views/spec-tickets/TicketActions';
import { useSpecTicketsStore } from '../../src/renderer/stores/specTickets';
import { detail, mockCockpit } from './ticket-fixtures';

describe('TicketActions', () => {
  afterEach(() => {
    cleanup();
    useSpecTicketsStore.setState(useSpecTicketsStore.getInitialState(), true);
  });

  it('shows exit code and output', async () => {
    const api = mockCockpit();
    api.run.mockResolvedValue({ exitCode: 1, stdout: 'SPEC-0001 gate "proposal": FAIL\n  ERROR no ACs', stderr: '', awaitingApproval: false });
    render(<TicketActions ticket={detail('SPEC-0001')} />);

    fireEvent.click(screen.getByRole('button', { name: 'Advance' }));
    await screen.findByText('exit 1');
    expect(screen.getByText(/ERROR no ACs/)).toBeTruthy();
    expect(api.run).toHaveBeenCalledWith({ kind: 'advance', id: 'SPEC-0001' });
  });

  it('runs note, block and reopen through input dialogs', async () => {
    const api = mockCockpit();
    render(<TicketActions ticket={detail('SPEC-0001', { status: 'design' })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Note…' }));
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
    await waitFor(() => expect(api.run).toHaveBeenCalledWith({ kind: 'note', id: 'SPEC-0001', text: 'hello' }));

    fireEvent.click(screen.getByRole('button', { name: 'Block…' }));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'waiting' } });
    fireEvent.click(screen.getByRole('button', { name: 'Block ticket' }));
    await waitFor(() => expect(api.run).toHaveBeenCalledWith({ kind: 'block', id: 'SPEC-0001', reason: 'waiting' }));

    fireEvent.click(screen.getByRole('button', { name: 'Reopen…' }));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'rethink' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reopen ticket' }));
    await waitFor(() => expect(api.run).toHaveBeenCalledWith({ kind: 'reopen', id: 'SPEC-0001', stage: 'proposal', reason: 'rethink' }));
  });

  it('unblock, autopilot and reopen of a blocked ticket', async () => {
    const api = mockCockpit();
    render(<TicketActions ticket={detail('SPEC-0001', { status: 'blocked', blockedFrom: 'plan', blockedReason: 'x' })} />);

    expect(screen.queryByRole('button', { name: 'Block…' })).toBeNull();
    expect((screen.getByRole('button', { name: 'Advance' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Unblock' }));
    await waitFor(() => expect(api.run).toHaveBeenCalledWith({ kind: 'unblock', id: 'SPEC-0001' }));

    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(api.run).toHaveBeenCalledWith({ kind: 'autopilot', id: 'SPEC-0001', on: true }));

    fireEvent.click(screen.getByRole('button', { name: 'Reopen…' }));
    const stages = [...(screen.getByLabelText('Back to stage') as HTMLSelectElement).options].map((o) => o.value);
    expect(stages).toEqual(['proposal', 'design']);
    fireEvent.change(screen.getByLabelText('Back to stage'), { target: { value: 'design' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'redo design' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reopen ticket' }));
    await waitFor(() => expect(api.run).toHaveBeenCalledWith({ kind: 'reopen', id: 'SPEC-0001', stage: 'design', reason: 'redo design' }));
  });

  it('approve needs confirmation and is hidden unless awaiting', async () => {
    const api = mockCockpit();
    const { unmount } = render(<TicketActions ticket={detail('SPEC-0001')} />);
    expect(screen.queryByRole('button', { name: 'Approve…' })).toBeNull();
    unmount();

    render(<TicketActions ticket={detail('SPEC-0001', { title: 'Cockpit tickets', awaiting: 'proposal' })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve…' }));
    expect(screen.getByText('Approve proposal of SPEC-0001 — Cockpit tickets?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.run).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Approve…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm approval' }));
    await waitFor(() => expect(api.run).toHaveBeenCalledTimes(1));
    expect(api.run).toHaveBeenCalledWith({ kind: 'approve', id: 'SPEC-0001' });
  });
});
