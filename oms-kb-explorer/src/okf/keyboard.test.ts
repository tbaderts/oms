import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSearchShortcut, isTypingTarget } from './keyboard.ts';

const el = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, isContentEditable: false, ...extra });

test('isTypingTarget: inputs, selects, textareas and contentEditable are typing targets (AC-7)', () => {
  for (const t of ['INPUT', 'SELECT', 'TEXTAREA', 'input']) assert.equal(isTypingTarget(el(t)), true, t);
  assert.equal(isTypingTarget(el('DIV', { isContentEditable: true })), true);
  for (const t of ['BODY', 'BUTTON', 'A', 'DIV']) assert.equal(isTypingTarget(el(t)), false, t);
  assert.equal(isTypingTarget(null), false);
});

test('isSearchShortcut: a plain "/" outside a typing target', () => {
  const key = (k: string, extra: Record<string, unknown> = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, target: el('BODY'), ...extra });
  assert.equal(isSearchShortcut(key('/')), true);
  assert.equal(isSearchShortcut(key('/', { target: el('INPUT') })), false);
  assert.equal(isSearchShortcut(key('/', { ctrlKey: true })), false);
  assert.equal(isSearchShortcut(key('/', { metaKey: true })), false);
  assert.equal(isSearchShortcut(key('a')), false);
});
