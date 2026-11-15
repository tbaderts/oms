import { render, screen } from '@testing-library/react';
import App from './App';

test('renders OMS UI navigation', () => {
  render(<App />);
  const logoElement = screen.getByLabelText(/Acme Capital Logo/i);
  expect(logoElement).toBeInTheDocument();
});

// AC-6 (SPEC-0054): the app shell is the public face — no emoji glyphs in the chrome.
test('noEmojiInControls: header, tabs and footer contain no emoji glyphs', () => {
  render(<App />);

  const shell = document.querySelector('.oms-app');
  expect(shell).not.toBeNull();
  expect(shell.textContent).not.toMatch(
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{25FB}-\u{25FE}]/u
  );
});

// SPEC-0059 AC-8: the data modes are named for what the trader sees, Live first and selected.
test('mode toggle reads Live and History', () => {
  render(<App />);
  const live = screen.getByRole('button', { name: 'Live' });
  const history = screen.getByRole('button', { name: 'History' });
  expect(live.getAttribute('aria-pressed')).toBe('true');
  expect(history.getAttribute('aria-pressed')).toBe('false');
  expect(live.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'REST' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Streaming' })).toBeNull();
});
