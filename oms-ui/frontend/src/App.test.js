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
