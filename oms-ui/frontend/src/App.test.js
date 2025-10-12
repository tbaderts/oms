import { render, screen } from '@testing-library/react';
import App from './App';

test('renders OMS UI navigation', () => {
  render(<App />);
  const linkElement = screen.getByText(/OMS UI/i);
  expect(linkElement).toBeInTheDocument();
});
