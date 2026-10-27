// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TicketSwitcher } from '../../src/renderer/views/spec-tickets/TicketSwitcher';
import { useSpecTicketsStore } from '../../src/renderer/stores/specTickets';
import { useDocEditorStore } from '../../src/renderer/stores/docEditor';
import { mockCockpit, summary } from './ticket-fixtures';

const TICKETS = [
  summary('SPEC-0001', { title: 'Reject zero quantity', status: 'implement' }),
  summary('SPEC-0002', { title: 'Cockpit dashboard', status: 'design', owner: 'Bob' }),
  summary('SPEC-0003', { title: 'Store reject reason', status: 'done' }),
];

function setup(selectedId: string | null = null) {
  const api = mockCockpit();
  useSpecTicketsStore.setState({ tickets: TICKETS, user: 'Alice', selectedId });
  render(<TicketSwitcher />);
  return api;
}

const options = () => within(screen.getByRole('listbox')).queryAllByRole('option');
const optionIds = () => options().map((o) => o.textContent?.match(/SPEC-\d{4}/)?.[0]);

describe('TicketSwitcher', () => {
  afterEach(() => {
    cleanup();
    useDocEditorStore.getState().close();
    useSpecTicketsStore.setState(useSpecTicketsStore.getInitialState(), true);
  });

  it('filters by id or title and selects with Enter or click', async () => {
    setup('SPEC-0001');
    const trigger = screen.getByRole('button', { name: /switch ticket/i });
    expect(trigger.textContent).toContain('SPEC-0001');
    expect(trigger.textContent).toContain('Reject zero quantity');

    fireEvent.click(trigger);
    const input = screen.getByRole('combobox');
    expect(document.activeElement).toBe(input);
    // All loaded tickets, regardless of owner; each with id, title and stage.
    expect(optionIds()).toEqual(['SPEC-0001', 'SPEC-0002', 'SPEC-0003']);
    expect(options()[1].textContent).toContain('Cockpit dashboard');
    expect(options()[1].textContent).toContain('design');

    fireEvent.change(input, { target: { value: 'DASH' } });
    expect(optionIds()).toEqual(['SPEC-0002']);
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(useSpecTicketsStore.getState().selectedId).toBe('SPEC-0002'));
    expect(screen.queryByRole('listbox')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /switch ticket/i }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '0003' } });
    fireEvent.click(options()[0]);
    await waitFor(() => expect(useSpecTicketsStore.getState().selectedId).toBe('SPEC-0003'));

    fireEvent.click(screen.getByRole('button', { name: /switch ticket/i }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'nothing like this' } });
    expect(optionIds()).toEqual([]);
    expect(screen.getByText('No matching tickets')).toBeTruthy();
  });

  it('keyboard navigation and Escape', async () => {
    setup();
    expect(screen.getByRole('button', { name: /switch ticket/i }).textContent).toContain('Select a ticket');
    fireEvent.click(screen.getByRole('button', { name: /switch ticket/i }));
    const input = screen.getByRole('combobox');

    // The first option is active; arrows move and wrap within the list.
    expect(input.getAttribute('aria-activedescendant')).toBe(options()[0].id);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(options()[2].getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.getAttribute('aria-activedescendant')).toBe(options()[1].id);

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(useSpecTicketsStore.getState().selectedId).toBeNull();

    // Outside click closes too.
    fireEvent.click(screen.getByRole('button', { name: /switch ticket/i }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('returns focus to the trigger, keeps the active option visible and closes when focus leaves', async () => {
    const scrolled: string[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this.id); };
    setup('SPEC-0001');
    const trigger = () => screen.getByRole('button', { name: /switch ticket/i });

    fireEvent.click(trigger());
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    expect(scrolled.at(-1)).toBe(options()[1].id);
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    expect(document.activeElement).toBe(trigger());

    fireEvent.click(trigger());
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    expect(document.activeElement).toBe(trigger());

    // Tabbing out of the open switcher closes it.
    fireEvent.click(trigger());
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    fireEvent.blur(screen.getByRole('combobox'), { relatedTarget: outside });
    expect(screen.queryByRole('listbox')).toBeNull();
    outside.remove();
    Element.prototype.scrollIntoView = original;
  });

  it('marks the active option with a colour that differs from the popup, and survives clicks on the popup', () => {
    setup('SPEC-0001');
    fireEvent.click(screen.getByRole('button', { name: /switch ticket/i }));
    // bg-accent equals bg-popover in dark mode (#1e293b), so the highlight must not rely on it.
    expect(options()[0].className).toContain('bg-primary/15');
    expect(options()[0].className).not.toMatch(/\bbg-accent\b/);
    expect(options()[1].className).not.toContain('bg-primary/15');

    // A mousedown on the popup's padding must not move focus away (which would close it).
    const popup = screen.getByRole('listbox').parentElement!;
    expect(fireEvent.mouseDown(popup)).toBe(false); // default prevented
    // ...but the search input keeps normal mouse behaviour (caret, selection).
    expect(fireEvent.mouseDown(screen.getByRole('combobox'))).toBe(true);
  });

  it('asks before discarding unsaved edits', async () => {
    setup('SPEC-0001');
    act(() => {
      useDocEditorStore.getState().open('SPEC-0001', 'tasks', 'base');
      useDocEditorStore.getState().edit('mine');
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    fireEvent.click(screen.getByRole('button', { name: /switch ticket/i }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'dash' } });
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });

    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(useSpecTicketsStore.getState().selectedId).toBe('SPEC-0001');
    expect(useDocEditorStore.getState()).toMatchObject({ ticketId: 'SPEC-0001', text: 'mine' });
    confirm.mockRestore();
  });
});
