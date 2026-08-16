import { render, screen } from '@testing-library/react';
import App from './App';

test('renders OMS UI navigation', () => {
  render(<App />);
  const logoElement = screen.getByLabelText(/Acme Capital Logo/i);
  expect(logoElement).toBeInTheDocument();
});
