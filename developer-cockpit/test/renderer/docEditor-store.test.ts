// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DRAFT_GATE_DEBOUNCE_MS, useDocEditorStore } from '../../src/renderer/stores/docEditor';
import { useSpecTicketsStore } from '../../src/renderer/stores/specTickets';
import { mockCockpit } from './ticket-fixtures';

const gate = (pass: boolean, errors: string[] = []) => ({ stage: 'proposal', pass, errors, warnings: [], exceptions: [] });

describe('useDocEditorStore', () => {
  afterEach(() => {
    vi.useRealTimers();
    useDocEditorStore.getState().close();
    useDocEditorStore.setState(useDocEditorStore.getInitialState(), true);
    useSpecTicketsStore.setState(useSpecTicketsStore.getInitialState(), true);
  });

  it('debounced draft gate result arrives within 2 s and is shown as draft', async () => {
    vi.useFakeTimers();
    const api = mockCockpit();
    api.draftGate.mockResolvedValue(gate(false, ['proposal.md: section "## Why" is empty']));
    const s = useDocEditorStore.getState();
    s.open('SPEC-0001', 'proposal', 'base');

    s.edit('base a');
    s.edit('base ab');
    s.edit('base abc');
    expect(useDocEditorStore.getState().dirty).toBe(true);
    expect(api.draftGate).not.toHaveBeenCalled();

    expect(DRAFT_GATE_DEBOUNCE_MS).toBeLessThanOrEqual(1000);
    await vi.advanceTimersByTimeAsync(DRAFT_GATE_DEBOUNCE_MS);
    // Only the last text is gated, once.
    expect(api.draftGate).toHaveBeenCalledTimes(1);
    expect(api.draftGate).toHaveBeenCalledWith('SPEC-0001', 'proposal', 'base abc');
    expect(useDocEditorStore.getState().draftGate).toEqual(gate(false, ['proposal.md: section "## Why" is empty']));

    // Editing back to the saved text drops the draft result.
    useDocEditorStore.getState().edit('base');
    expect(useDocEditorStore.getState()).toMatchObject({ dirty: false, draftGate: null });
  });

  it('ignores a draft result that arrives after the text changed again', async () => {
    vi.useFakeTimers();
    const api = mockCockpit();
    let resolveFirst: (g: unknown) => void = () => {};
    api.draftGate
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }))
      .mockResolvedValueOnce(gate(true));
    const s = useDocEditorStore.getState();
    s.open('SPEC-0001', 'proposal', 'base');

    s.edit('one');
    await vi.advanceTimersByTimeAsync(DRAFT_GATE_DEBOUNCE_MS);
    useDocEditorStore.getState().edit('two');
    await vi.advanceTimersByTimeAsync(DRAFT_GATE_DEBOUNCE_MS);
    resolveFirst(gate(false, ['stale']));
    await vi.advanceTimersByTimeAsync(0);

    expect(useDocEditorStore.getState().draftGate).toEqual(gate(true));
  });

  it('a new edit clears the previous draft result and error', async () => {
    vi.useFakeTimers();
    const api = mockCockpit();
    api.draftGate.mockResolvedValueOnce(gate(false, ['old'])).mockRejectedValueOnce(new Error('cli broke'));
    const s = useDocEditorStore.getState();
    s.open('SPEC-0001', 'proposal', 'base');

    s.edit('one');
    await vi.advanceTimersByTimeAsync(DRAFT_GATE_DEBOUNCE_MS);
    expect(useDocEditorStore.getState().draftGate).toEqual(gate(false, ['old']));

    // The result belongs to older text, so it must not stay on screen as "draft" while re-checking.
    useDocEditorStore.getState().edit('two');
    expect(useDocEditorStore.getState().draftGate).toBeNull();
    await vi.advanceTimersByTimeAsync(DRAFT_GATE_DEBOUNCE_MS);
    expect(useDocEditorStore.getState().error).toBe('cli broke');

    useDocEditorStore.getState().edit('three');
    expect(useDocEditorStore.getState().error).toBeNull();
  });

  it('save writes against the loaded base and refreshes the ticket', async () => {
    const api = mockCockpit();
    const refresh = vi.spyOn(useSpecTicketsStore.getState(), 'refresh').mockResolvedValue();
    const s = useDocEditorStore.getState();
    s.open('SPEC-0001', 'proposal', 'base');
    s.edit('mine');

    await useDocEditorStore.getState().save();

    expect(api.saveDocument).toHaveBeenCalledWith('SPEC-0001', 'proposal', 'mine', 'base', false);
    expect(useDocEditorStore.getState()).toMatchObject({ base: 'mine', text: 'mine', dirty: false, draftGate: null, conflict: null });
    expect(refresh).toHaveBeenCalled();
  });

  it('a conflicting save keeps the edits and exposes the disk content', async () => {
    const api = mockCockpit();
    api.saveDocument.mockResolvedValueOnce({ status: 'conflict', diskContent: 'theirs' });
    const s = useDocEditorStore.getState();
    s.open('SPEC-0001', 'proposal', 'base');
    s.edit('mine');

    await useDocEditorStore.getState().save();
    expect(useDocEditorStore.getState()).toMatchObject({ text: 'mine', dirty: true, conflict: 'theirs' });

    await useDocEditorStore.getState().save(true);
    expect(api.saveDocument).toHaveBeenLastCalledWith('SPEC-0001', 'proposal', 'mine', 'base', true);
    expect(useDocEditorStore.getState()).toMatchObject({ base: 'mine', dirty: false, conflict: null });
  });

  it('reload drops edits and takes disk content', async () => {
    const api = mockCockpit();
    api.saveDocument.mockResolvedValueOnce({ status: 'conflict', diskContent: 'theirs' });
    const s = useDocEditorStore.getState();
    s.open('SPEC-0001', 'proposal', 'base');
    s.edit('mine');
    await useDocEditorStore.getState().save();

    useDocEditorStore.getState().reload();
    expect(useDocEditorStore.getState()).toMatchObject({ base: 'theirs', text: 'theirs', dirty: false, conflict: null });
  });

  it('syncFromDisk follows the file when not dirty', () => {
    mockCockpit();
    const s = useDocEditorStore.getState();
    s.open('SPEC-0001', 'proposal', 'A');

    useDocEditorStore.getState().syncFromDisk('SPEC-0001', 'proposal', 'B');
    expect(useDocEditorStore.getState()).toMatchObject({ base: 'B', text: 'B', dirty: false });

    // Another document or ticket is ignored.
    useDocEditorStore.getState().syncFromDisk('SPEC-0002', 'proposal', 'X');
    useDocEditorStore.getState().syncFromDisk('SPEC-0001', 'design', 'X');
    expect(useDocEditorStore.getState().text).toBe('B');

    // With unsaved edits the editor keeps them; the conflict surfaces on save.
    useDocEditorStore.getState().edit('mine');
    useDocEditorStore.getState().syncFromDisk('SPEC-0001', 'proposal', 'C');
    expect(useDocEditorStore.getState()).toMatchObject({ base: 'B', text: 'mine', dirty: true });
  });

  it('confirmLeave asks only with unsaved edits and closes on confirm', () => {
    mockCockpit();
    const confirm = vi.spyOn(window, 'confirm');
    const s = useDocEditorStore.getState();
    s.open('SPEC-0001', 'proposal', 'base');
    expect(useDocEditorStore.getState().confirmLeave()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(useDocEditorStore.getState().ticketId).toBeNull();

    useDocEditorStore.getState().open('SPEC-0001', 'proposal', 'base');
    useDocEditorStore.getState().edit('mine');
    confirm.mockReturnValueOnce(false);
    expect(useDocEditorStore.getState().confirmLeave()).toBe(false);
    expect(useDocEditorStore.getState()).toMatchObject({ ticketId: 'SPEC-0001', text: 'mine' });

    confirm.mockReturnValueOnce(true);
    expect(useDocEditorStore.getState().confirmLeave()).toBe(true);
    expect(useDocEditorStore.getState()).toMatchObject({ ticketId: null, dirty: false });
    confirm.mockRestore();
  });
});
