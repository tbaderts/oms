import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

// SPEC-0072: the Order Entry tab. The blotters and the form are stubbed; the form's own behaviour
// is tested in OrderEntry.test.tsx.

jest.mock('./components/OrderBlotter', () => () => <div>REST orders</div>);
jest.mock('./components/ExecutionBlotter', () => () => <div>REST executions</div>);
jest.mock('./components/StreamingOrderBlotter', () => () => <div>Live orders</div>);
jest.mock('./components/StreamingExecutionBlotter', () => () => <div>Live executions</div>);
jest.mock('./components/OrderEntry', () => (props: any) => (
  <div>
    <label htmlFor="stub-symbol">Symbol</label>
    <input id="stub-symbol" />
    <button onClick={props.onShowOrders}>View in Orders</button>
  </div>
));
jest.mock('./services/ConfigService', () => ({
  ConfigService: {
    getConfig: async () => ({ appName: 'OMS' }),
    getFeatureFlags: () => ({ quotesEnabled: false, quoteRequestsEnabled: false, streamingEnabled: true }),
  },
  DEFAULT_FEATURE_FLAGS: { quotesEnabled: false, quoteRequestsEnabled: false, streamingEnabled: true },
}));

describe('App order entry tab (SPEC-0072)', () => {
  it('shows the form, keeps its input across tabs, and leads to the Orders tab', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Order Entry' }));
    fireEvent.change(screen.getByLabelText('Symbol'), { target: { value: 'AAPL' } });
    fireEvent.click(screen.getByRole('button', { name: 'Executions' }));
    expect(screen.getByText('Live executions')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Order Entry' }));
    expect((screen.getByLabelText('Symbol') as HTMLInputElement).value).toBe('AAPL');

    fireEvent.click(screen.getByRole('button', { name: 'View in Orders' }));
    expect(screen.getByRole('button', { name: 'Orders' })).toHaveClass('active');
    expect(screen.getByText('Live orders')).toBeVisible();
  });
});
