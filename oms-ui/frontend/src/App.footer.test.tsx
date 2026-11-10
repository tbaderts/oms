import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

// SPEC-0058 AC-6: the footer shows the current year from the clock, not a hard-coded one.
jest.mock('./components/OrderBlotter', () => () => null);
jest.mock('./components/ExecutionBlotter', () => () => null);
jest.mock('./components/StreamingOrderBlotter', () => () => null);
jest.mock('./components/StreamingExecutionBlotter', () => () => null);
jest.mock('./services/ConfigService', () => ({
  ConfigService: {
    getConfig: async () => ({ appName: 'OMS Admin Tool' }),
    getFeatureFlags: () => ({ quotesEnabled: false, quoteRequestsEnabled: false, streamingEnabled: true }),
  },
  DEFAULT_FEATURE_FLAGS: { quotesEnabled: false, quoteRequestsEnabled: false, streamingEnabled: true },
}));

describe('footer (SPEC-0058)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('shows the current year', async () => {
    jest.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2031);

    render(<App />);

    const footer = document.querySelector('.oms-footer') as HTMLElement;
    await waitFor(() => expect(footer.textContent).toBe('© 2031 Acme Capital · OMS Admin Tool'));
    expect(screen.queryByText(/2025/)).toBeNull();
  });
});
