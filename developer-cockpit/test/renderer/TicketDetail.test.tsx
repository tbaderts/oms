// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { TicketDetail } from '../../src/renderer/views/spec-tickets/TicketDetail';
import { useSpecTicketsStore } from '../../src/renderer/stores/specTickets';
import { detail, mockCockpit } from './ticket-fixtures';

describe('TicketDetail', () => {
  afterEach(() => {
    cleanup();
    useSpecTicketsStore.setState(useSpecTicketsStore.getInitialState(), true);
  });

  it('main region and status rail', () => {
    mockCockpit();
    useSpecTicketsStore.setState({
      selectedId: 'SPEC-0001',
      detail: detail('SPEC-0001', {
        title: 'Workspace ticket',
        status: 'implement',
        goal: 'Goal text.',
        log: ['2026-10-24 created'],
        documents: { proposal: '# Proposal heading' },
        acs: ['AC-1'],
        taskList: [{ id: 'T-1', done: false, acs: ['AC-1'], summary: 'Do it' }],
        tasks: { done: 0, total: 1 },
        gate: { stage: 'implement', pass: false, errors: ['tasks.md: T-1 is not done'], warnings: [], exceptions: [] },
      }),
    });
    render(<TicketDetail />);

    const main = screen.getByRole('region', { name: 'Ticket' });
    const rail = screen.getByRole('complementary', { name: 'Ticket status' });
    expect(within(main).getByText('Workspace ticket')).toBeTruthy();
    expect(within(main).getByText('Goal text.')).toBeTruthy();
    expect(within(main).getByRole('tab', { name: 'proposal.md' })).toBeTruthy();
    expect(within(main).getByText('2026-10-24 created')).toBeTruthy();
    expect(within(rail).getByText('tasks.md: T-1 is not done')).toBeTruthy();
    expect(within(rail).getByRole('button', { name: 'Advance' })).toBeTruthy();
    expect(within(rail).getByText('Do it')).toBeTruthy();
    expect(within(rail).getByText('Verification evidence')).toBeTruthy();
    expect(within(main).queryByRole('button', { name: 'Advance' })).toBeNull();
  });

  it('renders goal, documents, log and evidence', () => {
    mockCockpit();
    useSpecTicketsStore.setState({
      selectedId: 'SPEC-0001',
      detail: detail('SPEC-0001', {
        title: 'Cockpit tickets',
        status: 'implement',
        goal: 'Let developers see their tickets.',
        log: ['2026-10-24 created', '2026-10-24 10:00 — proposal approved by Alice'],
        documents: {
          proposal: '# Proposal heading\n\nWhy we do it.',
          design: '# Design heading\n\nHow we do it.',
        },
        acs: ['AC-1', 'AC-2'],
        taskList: [
          { id: 'T-1', done: true, acs: ['AC-1'], summary: 'First task' },
          { id: 'T-2', done: false, acs: ['AC-1', 'AC-2'], summary: 'Second task' },
        ],
        tasks: { done: 1, total: 2 },
        gate: { stage: 'implement', pass: false, errors: ['tasks.md: T-2 is not done'], warnings: ['a warning'], exceptions: [] },
        evidence: { result: 'pass', ranAt: '2026-10-24T10:00:00.000Z', modules: ['oms-core'], fresh: false, coversModules: true },
      }),
    });
    render(<TicketDetail />);

    expect(screen.getByText('Let developers see their tickets.')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'proposal.md' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'design.md' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'verification.md' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Proposal heading' })).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'design.md' }));
    expect(screen.getByRole('heading', { name: 'Design heading' })).toBeTruthy();

    expect(screen.getByText('2026-10-24 created')).toBeTruthy();
    expect(screen.getByText('2026-10-24 10:00 — proposal approved by Alice')).toBeTruthy();

    expect(screen.getByText('Stale')).toBeTruthy();
    expect(screen.getByText('tasks.md: T-2 is not done')).toBeTruthy();
    expect(screen.getByText('a warning')).toBeTruthy();
    expect(screen.getByText('Second task')).toBeTruthy();
    expect(screen.getByLabelText('Stage implement (current)')).toBeTruthy();
  });

  it('shows fresh evidence and no-evidence states', () => {
    mockCockpit();
    useSpecTicketsStore.setState({
      selectedId: 'SPEC-0001',
      detail: detail('SPEC-0001', {
        evidence: { result: 'pass', ranAt: '2026-10-24T10:00:00.000Z', modules: ['oms-core'], fresh: true, coversModules: true },
      }),
    });
    const { unmount } = render(<TicketDetail />);
    expect(screen.getByText('Fresh')).toBeTruthy();
    unmount();

    useSpecTicketsStore.setState({ detail: detail('SPEC-0001') });
    render(<TicketDetail />);
    expect(screen.getByText(/No verification evidence yet/)).toBeTruthy();
  });
});
