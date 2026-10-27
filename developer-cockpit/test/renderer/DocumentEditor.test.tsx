// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DocumentEditor } from '../../src/renderer/views/spec-tickets/DocumentEditor';
import { useDocEditorStore } from '../../src/renderer/stores/docEditor';
import { useSpecTicketsStore } from '../../src/renderer/stores/specTickets';
import { detail, mockCockpit } from './ticket-fixtures';

// Monaco needs a real browser; a textarea stands in for it.
vi.mock('@monaco-editor/react', () => ({
  loader: { config: () => {} },
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="Document text" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

describe('DocumentEditor', () => {
  afterEach(() => {
    cleanup();
    useDocEditorStore.getState().close();
    useSpecTicketsStore.setState(useSpecTicketsStore.getInitialState(), true);
  });

  it('save via button and Ctrl+S clears Modified and refreshes the gate', async () => {
    const api = mockCockpit();
    const passing = { stage: 'proposal', pass: true, errors: [], warnings: [], exceptions: [] };
    api.get.mockResolvedValue(detail('SPEC-0001', { gate: passing }));
    useSpecTicketsStore.setState({ selectedId: 'SPEC-0001', detail: detail('SPEC-0001'), tickets: [detail('SPEC-0001')] });
    api.list.mockResolvedValue({ user: 'Alice', types: [], tickets: [detail('SPEC-0001')], errors: [] });
    useDocEditorStore.getState().open('SPEC-0001', 'proposal', 'base');
    render(<DocumentEditor />);

    expect(screen.getByText('proposal.md')).toBeTruthy();
    const save = screen.getByRole('button', { name: /Save/ }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(screen.queryByText('Modified')).toBeNull();

    fireEvent.change(screen.getByLabelText('Document text'), { target: { value: 'first edit' } });
    expect(screen.getByText('Modified')).toBeTruthy();
    fireEvent.click(save);
    await waitFor(() => expect(screen.queryByText('Modified')).toBeNull());
    expect(api.saveDocument).toHaveBeenLastCalledWith('SPEC-0001', 'proposal', 'first edit', 'base', false);
    await waitFor(() => expect(useSpecTicketsStore.getState().detail?.gate).toEqual(passing));

    fireEvent.change(screen.getByLabelText('Document text'), { target: { value: 'second edit' } });
    fireEvent.keyDown(screen.getByLabelText('Document text'), { key: 's', ctrlKey: true });
    await waitFor(() => expect(screen.queryByText('Modified')).toBeNull());
    expect(api.saveDocument).toHaveBeenLastCalledWith('SPEC-0001', 'proposal', 'second edit', 'first edit', false);
  });

  it('conflict banner offers reload and overwrite', async () => {
    const api = mockCockpit();
    api.saveDocument.mockResolvedValueOnce({ status: 'conflict', diskContent: 'theirs' });
    useDocEditorStore.getState().open('SPEC-0001', 'proposal', 'base');
    render(<DocumentEditor />);
    fireEvent.change(screen.getByLabelText('Document text'), { target: { value: 'mine' } });

    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await screen.findByText(/changed on disk/);
    expect((screen.getByLabelText('Document text') as HTMLTextAreaElement).value).toBe('mine');

    fireEvent.click(screen.getByRole('button', { name: 'Overwrite' }));
    await waitFor(() => expect(screen.queryByText(/changed on disk/)).toBeNull());
    expect(api.saveDocument).toHaveBeenLastCalledWith('SPEC-0001', 'proposal', 'mine', 'base', true);

    api.saveDocument.mockResolvedValueOnce({ status: 'conflict', diskContent: 'newer' });
    fireEvent.change(screen.getByLabelText('Document text'), { target: { value: 'mine again' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await screen.findByText(/changed on disk/);
    fireEvent.click(screen.getByRole('button', { name: 'Reload from disk' }));
    expect((screen.getByLabelText('Document text') as HTMLTextAreaElement).value).toBe('newer');
    expect(screen.queryByText('Modified')).toBeNull();
  });
});
