// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SpecTicketsView } from '../../src/renderer/views/spec-tickets/SpecTicketsView';
import { useSpecTicketsStore } from '../../src/renderer/stores/specTickets';
import { detail, mockCockpit } from './ticket-fixtures';

async function createTicket() {
  fireEvent.click(await screen.findByRole('button', { name: /New ticket/ }));
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Reject zero qty' } });
  fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'fix' } });
  fireEvent.change(screen.getByLabelText('Modules (comma-separated)'), { target: { value: 'oms-core, nope' } });
  fireEvent.change(screen.getByLabelText("Goal (the requester's words)"), { target: { value: 'Zero quantity is rejected.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create ticket' }));
}

describe('NewTicketDialog', () => {
  afterEach(() => {
    cleanup();
    useSpecTicketsStore.setState(useSpecTicketsStore.getInitialState(), true);
  });

  it('shows the CLI rejection of a new ticket', async () => {
    const api = mockCockpit();
    api.run.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'unknown module(s) nope; see specs/config.json', awaitingApproval: false });
    render(<SpecTicketsView />);

    await createTicket();
    await screen.findByText('exit 1');
    expect(screen.getByText(/unknown module\(s\) nope/)).toBeTruthy();
    expect(api.run).toHaveBeenCalledWith({
      kind: 'new', title: 'Reject zero qty', type: 'fix', modules: ['oms-core', 'nope'], goal: 'Zero quantity is rejected.',
    });
    expect(useSpecTicketsStore.getState().selectedId).toBeNull();
  });

  it('selects the created ticket and shows the output', async () => {
    const api = mockCockpit();
    api.run.mockResolvedValue({
      exitCode: 0,
      stdout: 'Created SPEC-0003 in specs/changes/SPEC-0003-reject-zero-qty\nNext: Fill proposal.md',
      stderr: '',
      awaitingApproval: false,
    });
    api.get.mockResolvedValue(detail('SPEC-0003', { title: 'Reject zero qty' }));
    render(<SpecTicketsView />);

    await createTicket();
    await waitFor(() => expect(useSpecTicketsStore.getState().selectedId).toBe('SPEC-0003'));
    expect(api.get).toHaveBeenCalledWith('SPEC-0003');
    expect(await screen.findByText(/Created SPEC-0003/)).toBeTruthy();
    expect(screen.getAllByText('exit 0')).toHaveLength(1);
  });
});
