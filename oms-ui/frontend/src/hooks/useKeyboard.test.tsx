import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { useDialog, useShortcuts } from './useKeyboard';

const Dialog = ({ onClose }: { onClose: () => void }) => {
  const ref = useDialog<HTMLDivElement>(onClose);
  return (
    <div className="modal-overlay">
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Test dialog">
        <button>Inside</button>
      </div>
    </div>
  );
};

const Opener = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      {open && <Dialog onClose={() => setOpen(false)} />}
    </>
  );
};

const Shortcuts = ({ enabled, onF }: { enabled: boolean; onF: () => void }) => {
  useShortcuts(enabled, { f: onF });
  return (
    <>
      <input aria-label="text" />
      <input aria-label="check" type="checkbox" />
    </>
  );
};

describe('useDialog (SPEC-0059)', () => {
  test('calls onClose on Escape only', () => {
    const onClose = jest.fn();
    const { unmount } = render(<Dialog onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('moves focus into the dialog and gives it back on close', () => {
    render(<Opener />);
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  test('a dialog in a hidden view ignores Escape', () => {
    const onClose = jest.fn();
    render(<div hidden><Dialog onClose={onClose} /></div>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('useShortcuts (SPEC-0059)', () => {
  test('runs the mapped key, case-insensitive', () => {
    const onF = jest.fn();
    render(<Shortcuts enabled onF={onF} />);
    fireEvent.keyDown(document.body, { key: 'f' });
    fireEvent.keyDown(document.body, { key: 'F' });
    expect(onF).toHaveBeenCalledTimes(2);
  });

  test('a focused checkbox does not swallow shortcuts', () => {
    const onF = jest.fn();
    render(<Shortcuts enabled onF={onF} />);
    fireEvent.keyDown(screen.getByLabelText('check'), { key: 'f' });
    expect(onF).toHaveBeenCalledTimes(1);
  });

  test('ignores keys typed in a text input, with modifiers, while disabled or while a shown dialog is open', () => {
    const onF = jest.fn();
    const { rerender } = render(<Shortcuts enabled onF={onF} />);
    fireEvent.keyDown(screen.getByLabelText('text'), { key: 'f' });
    fireEvent.keyDown(document.body, { key: 'f', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'f', metaKey: true });
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    document.body.appendChild(overlay);
    fireEvent.keyDown(document.body, { key: 'f' });
    overlay.remove();
    rerender(<Shortcuts enabled={false} onF={onF} />);
    fireEvent.keyDown(document.body, { key: 'f' });
    expect(onF).not.toHaveBeenCalled();
  });

  test('a dialog left open in a hidden view does not block shortcuts', () => {
    const onF = jest.fn();
    render(<Shortcuts enabled onF={onF} />);
    const hiddenView = document.createElement('div');
    hiddenView.hidden = true;
    hiddenView.innerHTML = '<div class="modal-overlay"></div>';
    document.body.appendChild(hiddenView);
    fireEvent.keyDown(document.body, { key: 'f' });
    hiddenView.remove();
    expect(onF).toHaveBeenCalledTimes(1);
  });
});
