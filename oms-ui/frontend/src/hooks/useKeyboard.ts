// useKeyboard.ts - keyboard support for the blotters and their dialogs (SPEC-0059).
import { RefObject, useEffect, useRef } from 'react';

/** False for an element inside a hidden view: blotter views are kept mounted with `hidden` (SPEC-0056). */
export function isShown(element: Element | null): boolean {
  return !!element && !element.closest('[hidden]');
}

/**
 * Wires a dialog for the keyboard. Attach the returned ref to the dialog element. While the dialog
 * is shown:
 * - Escape calls onClose;
 * - focus moves into the dialog when it opens, and returns to where it was when it closes.
 * A dialog in a hidden view ignores Escape, so only the visible one closes.
 */
export function useDialog<T extends HTMLElement>(onClose: () => void): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    if (dialog && isShown(dialog)) {
      if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1');
      dialog.focus();
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isShown(ref.current)) onCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previous && previous.isConnected && typeof previous.focus === 'function') previous.focus();
    };
  }, []);

  return ref;
}

/** Input types where a letter is text being typed; a focused checkbox or button is not. */
const TEXT_INPUT_TYPES = new Set([
  'text', 'search', 'email', 'password', 'tel', 'url', 'number', 'date', 'datetime-local', 'month', 'time', 'week',
]);

/** True when a key event belongs to the user typing, not to a shortcut. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(target.type || 'text');
  return target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;
}

/** True while a dialog is open in the visible part of the page. */
function dialogOpen(): boolean {
  return Array.from(document.querySelectorAll('.modal-overlay')).some(isShown);
}

/**
 * Single-key shortcuts (`{ f: openFilters }`), case-insensitive, while `enabled`. Ignored while the
 * user types in a text field, with Ctrl, Meta or Alt held, and while a visible dialog is open.
 */
export function useShortcuts(enabled: boolean, shortcuts: Record<string, (() => void) | undefined>): void {
  const ref = useRef(shortcuts);
  ref.current = shortcuts;
  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
      if (dialogOpen()) return;
      const action = ref.current[event.key.toLowerCase()];
      if (!action) return;
      event.preventDefault();
      action();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
