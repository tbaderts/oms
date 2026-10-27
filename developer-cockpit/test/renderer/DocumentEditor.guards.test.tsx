// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TicketDetail } from '../../src/renderer/views/spec-tickets/TicketDetail';
import { TicketActions } from '../../src/renderer/views/spec-tickets/TicketActions';
import { useSpecTicketsStore } from '../../src/renderer/stores/specTickets';
import { useDocEditorStore } from '../../src/renderer/stores/docEditor';
import { useNavigationStore } from '../../src/renderer/stores/navigation';
import { detail, mockCockpit } from './ticket-fixtures';

vi.mock('@monaco-editor/react', () => ({
  loader: { config: () => {} },
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="Document text" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const DOCS = { proposal: '# P\n', design: '# D\n' };

/** Opens SPEC-0001's design.md in the editor and types into it. */
function editDesign() {
  const d = detail('SPEC-0001', { status: 'design', documents: DOCS });
  useSpecTicketsStore.setState({ selectedId: 'SPEC-0001', detail: d });
  useNavigationStore.setState({ activeView: 'spec-tickets' });
  render(<TicketDetail />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit design.md' }));
  fireEvent.change(screen.getByLabelText('Document text'), { target: { value: '# D mine\n' } });
  expect(useDocEditorStore.getState().dirty).toBe(true);
}

describe('unsaved-edit guards', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useDocEditorStore.getState().close();
    useSpecTicketsStore.setState(useSpecTicketsStore.getInitialState(), true);
    useNavigationStore.setState({ activeView: 'dashboard' });
  });

  it('selecting another ticket, tab or view asks to confirm; cancel keeps edits and selection', async () => {
    const api = mockCockpit();
    // Re-selecting reloads the ticket; keep it at design so only the guards are under test.
    api.get.mockResolvedValue(detail('SPEC-0001', { status: 'design', documents: DOCS }));
    editDesign();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    // Another ticket
    await act(() => useSpecTicketsStore.getState().select('SPEC-0002'));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(useSpecTicketsStore.getState().selectedId).toBe('SPEC-0001');
    expect(api.get).not.toHaveBeenCalledWith('SPEC-0002');

    // Another document tab (Radix tabs switch on mouse down)
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'proposal.md' }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect((screen.getByLabelText('Document text') as HTMLTextAreaElement).value).toBe('# D mine\n');

    // Another view
    act(() => useNavigationStore.getState().setActiveView('git-overview'));
    expect(confirm).toHaveBeenCalledTimes(3);
    expect(useNavigationStore.getState().activeView).toBe('spec-tickets');
    expect(useDocEditorStore.getState()).toMatchObject({ text: '# D mine\n', dirty: true });

    // Re-selecting the same ticket or view does not ask.
    await act(() => useSpecTicketsStore.getState().select('SPEC-0001'));
    act(() => useNavigationStore.getState().setActiveView('spec-tickets'));
    expect(confirm).toHaveBeenCalledTimes(3);

    // Confirming discards the edits and goes ahead.
    confirm.mockReturnValue(true);
    act(() => useNavigationStore.getState().setActiveView('git-overview'));
    expect(useNavigationStore.getState().activeView).toBe('git-overview');
    expect(useDocEditorStore.getState()).toMatchObject({ ticketId: null, dirty: false });
  });

  it('Advance is disabled while dirty on a ticket that is not awaiting approval', () => {
    mockCockpit();
    // Not awaiting, so Advance is enabled and only the unsaved edits can disable it.
    render(<TicketActions ticket={detail('SPEC-0001', { status: 'design', documents: DOCS })} />);
    const advance = () => screen.getByRole('button', { name: 'Advance' }) as HTMLButtonElement;
    expect(advance().disabled).toBe(false);

    act(() => {
      useDocEditorStore.getState().open('SPEC-0001', 'design', '# D\n');
      useDocEditorStore.getState().edit('# D mine\n');
    });
    expect(advance().disabled).toBe(true);
    expect(advance().title).toMatch(/Save or discard/);

    act(() => useDocEditorStore.getState().edit('# D\n'));
    expect(advance().disabled).toBe(false);
  });

  it('Advance and Approve are disabled while dirty', () => {
    mockCockpit();
    const t = detail('SPEC-0001', { status: 'proposal', awaiting: 'proposal', documents: DOCS });
    render(<TicketActions ticket={t} />);
    const approve = () => screen.getByRole('button', { name: 'Approve…' }) as HTMLButtonElement;
    const advance = () => screen.getByRole('button', { name: 'Advance' }) as HTMLButtonElement;
    expect(approve().disabled).toBe(false);

    act(() => {
      useDocEditorStore.getState().open('SPEC-0001', 'proposal', '# P\n');
      useDocEditorStore.getState().edit('# P mine\n');
    });
    expect(approve().disabled).toBe(true);
    expect(advance().disabled).toBe(true);
    expect(approve().title).toMatch(/Save or discard/);

    // Edits of another ticket do not block this one.
    act(() => {
      useDocEditorStore.getState().close();
      useDocEditorStore.getState().open('SPEC-0002', 'proposal', '# P\n');
      useDocEditorStore.getState().edit('# other\n');
    });
    expect(approve().disabled).toBe(false);
  });
});
