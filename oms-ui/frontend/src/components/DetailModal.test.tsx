import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import DetailModal from './DetailModal';

// SPEC-0058 AC-5: the modal is titled by the object it shows, in the singular ("Order details").
describe('DetailModal (SPEC-0058)', () => {
  it('titles the modal by the singular object', () => {
    render(<DetailModal data={{ orderId: 'ORD-1' }} title="Order details" onClose={() => undefined} />);

    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Order details');
    expect(screen.queryByText(/Orders Details/)).toBeNull();
  });

  it('closes from the header icon button, which has a name', () => {
    const onClose = jest.fn();
    const { container } = render(<DetailModal data={{ orderId: 'ORD-1' }} title="Order details" onClose={onClose} />);

    const close = container.querySelector('.modal-header button') as HTMLElement;
    expect(close.getAttribute('aria-label')).toBe('Close details');
    expect(close.querySelector('svg')).not.toBeNull();
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalled();
  });
});
