// SPEC-0074 AC-5: JSON content of the order history as a readable, collapsible tree.
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JsonTree from './JsonTree';

const command = {
  type: 'OrderReplaceRequestCmd',
  orderId: 'ORD-1',
  order: { price: 170.5, orderQty: 100, parties: [{ id: 'P1' }, { id: 'P2' }] },
  urgent: false,
  text: null,
};

describe('JsonTree (SPEC-0074)', () => {
  it('renders typed leaves of the expanded root', () => {
    const { container } = render(<JsonTree value={command} label="Command" defaultExpanded />);

    expect(container.querySelector('.json-string')?.textContent).toBe('"OrderReplaceRequestCmd"');
    expect(container.querySelector('.json-boolean')?.textContent).toBe('false');
    expect(container.querySelector('.json-null')?.textContent).toBe('null');
    expect(screen.getByText('type')).toBeInTheDocument();
  });

  it('collapses nested nodes until expanded', () => {
    const { container } = render(<JsonTree value={command} label="Command" defaultExpanded />);

    const order = screen.getByRole('button', { name: /order/ });
    expect(order.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('.json-number')).toBeNull();

    fireEvent.click(order);

    expect(order.getAttribute('aria-expanded')).toBe('true');
    expect(Array.from(container.querySelectorAll('.json-number')).map((n) => n.textContent)).toEqual(['170.5', '100']);
    expect(screen.getByRole('button', { name: /parties/ }).getAttribute('aria-expanded')).toBe('false');
  });

  it('is collapsed at the root by default', () => {
    render(<JsonTree value={command} label="Order snapshot" />);

    const root = screen.getByRole('button', { name: /Order snapshot/ });
    expect(root.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('type')).toBeNull();
  });

  it('toggles with the keyboard, Enter and Space', async () => {
    const user = userEvent.setup();
    render(<JsonTree value={command} label="Command" />);
    const root = screen.getByRole('button', { name: /Command/ });

    root.focus();
    await user.keyboard('{Enter}');
    expect(root.getAttribute('aria-expanded')).toBe('true');
    await user.keyboard(' ');
    expect(root.getAttribute('aria-expanded')).toBe('false');
  });

  it('reaches nested nodes with Tab', async () => {
    const user = userEvent.setup();
    render(<JsonTree value={command} label="Command" defaultExpanded />);

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Command/ }));
    await user.tab();
    const order = screen.getByRole('button', { name: /order/ });
    expect(document.activeElement).toBe(order);
    await user.keyboard('{Enter}');
    expect(order.getAttribute('aria-expanded')).toBe('true');
  });

  it('shows a string leaf as JSON, quotes and line breaks escaped', () => {
    const { container } = render(<JsonTree value={{ text: 'say "hi"\nbye' }} label="Command" defaultExpanded />);

    expect(container.querySelector('.json-string')?.textContent).toBe('"say \\"hi\\"\\nbye"');
  });

  it('copies the raw JSON', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<JsonTree value={command} label="Command" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Copy JSON/ }));
    });

    expect(writeText).toHaveBeenCalledWith(JSON.stringify(command, null, 2));
    expect(screen.getByText('Copied')).toBeInTheDocument();
  });

  it('says so when copying fails', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: jest.fn().mockRejectedValue(new Error('denied')) }, configurable: true });
    render(<JsonTree value={command} label="Command" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Copy JSON/ }));
    });

    expect(screen.getByText('Copy failed')).toBeInTheDocument();
  });

  it('shows a scalar root as its value', () => {
    const { container } = render(<JsonTree value={42} label="Version" />);

    expect(container.querySelector('.json-number')?.textContent).toBe('42');
  });
});
