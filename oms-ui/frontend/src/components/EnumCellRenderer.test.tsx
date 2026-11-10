import React from 'react';
import { render } from '@testing-library/react';
import EnumCellRenderer from './EnumCellRenderer';

// SPEC-0058 AC-4: a badge shows the metamodel's label as it is ("Sell Short"), coloured by its value.
describe('EnumCellRenderer (SPEC-0058)', () => {
  it('shows the label as given with a value class', () => {
    const { container } = render(<EnumCellRenderer value="SELL_SHORT" valueFormatted="Sell Short" />);
    const badge = container.querySelector('span')!;

    expect(badge.textContent).toBe('Sell Short');
    expect(badge.className).toBe('enum-cell enum-sell-short');
  });

  it('falls back to the value without a label', () => {
    const { container } = render(<EnumCellRenderer value="CXL" />);

    expect(container.querySelector('span')!.textContent).toBe('CXL');
  });

  it('renders nothing without a value', () => {
    const { container } = render(<EnumCellRenderer value="" />);

    expect(container.innerHTML).toBe('');
  });
});
