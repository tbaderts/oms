import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AuthorizeModal from './AuthorizeModal';

// SPEC-0059 AC-6 (review): every dialog closes on Escape and is announced as a modal dialog.
describe('AuthorizeModal keyboard (SPEC-0059)', () => {
  it('Escape closes, and it is a modal dialog', () => {
    const onClose = jest.fn();
    render(<AuthorizeModal onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: 'Authorization' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
