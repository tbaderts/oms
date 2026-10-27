// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TicketDetail } from '../../src/renderer/views/spec-tickets/TicketDetail';
import { useSpecTicketsStore } from '../../src/renderer/stores/specTickets';
import { useDocEditorStore } from '../../src/renderer/stores/docEditor';
import type { SpecTicketDetail } from '../../src/shared/types/specTickets';
import { detail, mockCockpit } from './ticket-fixtures';

vi.mock('@monaco-editor/react', () => ({
  loader: { config: () => {} },
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="Document text" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const DOCS = { proposal: '# P\n', design: '# D\n', tasks: '- [ ] **T-1** One (AC-1)\n- [x] **T-2** Two (AC-1)\n', verification: '# V\n' };

function show(d: SpecTicketDetail) {
  useSpecTicketsStore.setState({ selectedId: d.id, detail: d });
  return render(<TicketDetail />);
}

const editButtons = () => screen.queryAllByRole('button', { name: /^Edit / });

describe('TicketDetail editing', () => {
  afterEach(() => {
    cleanup();
    useDocEditorStore.getState().close();
    useSpecTicketsStore.setState(useSpecTicketsStore.getInitialState(), true);
  });

  it('offers Edit only on the current stage document', async () => {
    mockCockpit();
    const cases: [Partial<SpecTicketDetail>, string][] = [
      [{ status: 'proposal' }, 'proposal.md'],
      [{ status: 'design' }, 'design.md'],
      [{ status: 'plan' }, 'tasks.md'],
      [{ status: 'implement' }, 'tasks.md'],
      [{ status: 'verify' }, 'verification.md'],
      [{ status: 'blocked', blockedFrom: 'design', blockedReason: 'x' }, 'design.md'],
    ];
    for (const [overrides, file] of cases) {
      show(detail('SPEC-0001', { ...overrides, documents: DOCS }));
      expect(editButtons().map((b) => b.textContent?.trim()), String(overrides.status)).toEqual([`Edit ${file}`]);
      cleanup();
    }

    show(detail('SPEC-0001', { status: 'design', documents: DOCS }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit design.md' }));
    expect((screen.getByLabelText('Document text') as HTMLTextAreaElement).value).toBe('# D\n');
    expect(useDocEditorStore.getState()).toMatchObject({ ticketId: 'SPEC-0001', doc: 'design' });
  });

  it('offers no Edit for archived or done tickets', () => {
    mockCockpit();
    show(detail('SPEC-0001', { status: 'done', documents: DOCS }));
    expect(editButtons()).toEqual([]);
    cleanup();
    show(detail('SPEC-0001', { status: 'design', archived: true, documents: DOCS }));
    expect(editButtons()).toEqual([]);
  });

  it('gate panel labels draft results', () => {
    mockCockpit();
    show(detail('SPEC-0001', {
      status: 'proposal',
      documents: DOCS,
      gate: { stage: 'proposal', pass: false, errors: ['saved file error'], warnings: [], exceptions: [] },
    }));
    expect(screen.getByText('saved file error')).toBeTruthy();
    expect(screen.queryByText(/draft/i)).toBeNull();

    act(() => {
      useDocEditorStore.getState().open('SPEC-0001', 'proposal', '# P\n');
      useDocEditorStore.setState({
        text: '# P edited\n',
        dirty: true,
        draftGate: { stage: 'proposal', pass: true, errors: [], warnings: ['draft warning'], exceptions: [] },
      });
    });
    expect(screen.getByText(/draft \(unsaved\)/i)).toBeTruthy();
    expect(screen.getByText('draft warning')).toBeTruthy();
    expect(screen.queryByText('saved file error')).toBeNull();
  });

  it('task checkboxes only at implement', async () => {
    const api = mockCockpit();
    const taskList = [
      { id: 'T-1', done: false, acs: ['AC-1'], summary: 'One' },
      { id: 'T-2', done: true, acs: ['AC-1'], summary: 'Two' },
    ];
    show(detail('SPEC-0001', { status: 'plan', documents: DOCS, taskList }));
    // (The autopilot Switch renders its own hidden checkbox, so match the task ones by name.)
    expect(screen.queryAllByRole('checkbox', { name: /^Toggle T-/ })).toEqual([]);
    cleanup();

    const implement = detail('SPEC-0001', { status: 'implement', documents: DOCS, taskList });
    // Each tick refreshes the ticket; keep returning the same one.
    api.get.mockResolvedValue(implement);
    api.list.mockResolvedValue({ user: 'Alice', types: [], tickets: [implement], errors: [] });
    show(implement);
    const t1 = screen.getByRole('checkbox', { name: 'Toggle T-1' }) as HTMLInputElement;
    const t2 = screen.getByRole('checkbox', { name: 'Toggle T-2' }) as HTMLInputElement;
    expect([t1.checked, t2.checked]).toEqual([false, true]);

    fireEvent.click(t1);
    await waitFor(() => expect(api.toggleTask).toHaveBeenCalledWith('SPEC-0001', 'T-1', true, DOCS.tasks, false));
    fireEvent.click(t2);
    await waitFor(() => expect(api.toggleTask).toHaveBeenCalledWith('SPEC-0001', 'T-2', false, DOCS.tasks, false));

    api.toggleTask.mockResolvedValueOnce({ status: 'conflict', diskContent: 'other' });
    fireEvent.click(t1);
    await screen.findByText(/tasks.md changed on disk/);
  });

  it('closes the editor when the stage moves on', () => {
    mockCockpit();
    show(detail('SPEC-0001', { status: 'design', documents: DOCS }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit design.md' }));

    // e.g. `spec advance` in a terminal: design.md is no longer the editable document.
    act(() => useSpecTicketsStore.setState({ detail: detail('SPEC-0001', { status: 'plan', documents: DOCS }) }));
    expect(useDocEditorStore.getState().ticketId).toBeNull();
    expect(screen.queryByLabelText('Document text')).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit tasks.md' })).toBeTruthy();
  });

  it('asks before closing an editor with unsaved edits when the stage moves on', () => {
    mockCockpit();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    show(detail('SPEC-0001', { status: 'design', documents: DOCS }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit design.md' }));
    fireEvent.change(screen.getByLabelText('Document text'), { target: { value: '# D mine\n' } });

    act(() => useSpecTicketsStore.setState({ detail: detail('SPEC-0001', { status: 'plan', documents: DOCS }) }));
    expect(confirm).toHaveBeenCalledTimes(1);
    // Cancel keeps the text so it can be copied elsewhere.
    expect(useDocEditorStore.getState()).toMatchObject({ doc: 'design', text: '# D mine\n' });
    confirm.mockRestore();
  });

  it('non-editable tabs show the Reopen hint', () => {
    mockCockpit();
    show(detail('SPEC-0001', { status: 'design', documents: DOCS }));
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'proposal.md' }));
    expect(screen.getByText(/use Reopen/i)).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'design.md' }));
    expect(screen.queryByText(/use Reopen/i)).toBeNull();
  });

  it('a clean editor follows the document on disk', () => {
    mockCockpit();
    show(detail('SPEC-0001', { status: 'design', documents: DOCS }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit design.md' }));

    act(() => useSpecTicketsStore.setState({ detail: detail('SPEC-0001', { status: 'design', documents: { ...DOCS, design: '# D changed\n' } }) }));
    expect((screen.getByLabelText('Document text') as HTMLTextAreaElement).value).toBe('# D changed\n');
  });
});
