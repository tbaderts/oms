import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import BlotterToolbar from './BlotterToolbar';

describe('BlotterToolbar (SPEC-0059)', () => {
  it('renders the shared part and the mode actions', () => {
    const onFilters = jest.fn();
    const onColumns = jest.fn();
    const onAutoSize = jest.fn();
    render(
      <BlotterToolbar
        mode="live"
        title="Orders"
        recordCount={1234}
        filterCount={2}
        onFilters={onFilters}
        onColumns={onColumns}
        onAutoSize={onAutoSize}
        status={<span>connected</span>}
        actions={<button>Pause</button>}
      />
    );
    const toolbar = screen.getByTestId('blotter-toolbar');
    expect(toolbar.getAttribute('data-mode')).toBe('live');
    expect(within(toolbar).getByRole('heading', { name: 'Orders' })).toBeInTheDocument();
    expect(within(toolbar).getByText('1,234 records')).toBeInTheDocument();
    expect(within(toolbar).getByText('connected')).toBeInTheDocument();
    expect(within(toolbar).getByRole('button', { name: 'Pause' })).toBeInTheDocument();

    const filters = within(toolbar).getByRole('button', { name: /Filters/ });
    expect(filters.getAttribute('title')).toBe('Filters (F)');
    expect(filters.getAttribute('aria-keyshortcuts')).toBe('F');
    expect(within(toolbar).getByRole('button', { name: /Columns/ }).getAttribute('aria-keyshortcuts')).toBe('C');
    expect(filters.textContent).toContain('2');
    expect(within(toolbar).getByRole('button', { name: /Columns/ }).getAttribute('title')).toBe('Columns (C)');
    fireEvent.click(filters);
    fireEvent.click(within(toolbar).getByRole('button', { name: /Columns/ }));
    fireEvent.click(within(toolbar).getByRole('button', { name: /Auto-Size/ }));
    expect([onFilters, onColumns, onAutoSize].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
  });
});
