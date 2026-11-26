// OrderEntry.test.tsx - the Order Entry tab (SPEC-0072)
import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import OrderEntry from './OrderEntry';
import { MARKET_DATA_UNAVAILABLE } from '../services/MarketDataService';

const mockCreateOrder = jest.fn();
const mockFindOrderByClOrdId = jest.fn();
jest.mock('../services/OMSApiService', () => ({
  OMSApiService: {
    getInstance: async () => ({
      createOrder: (...args: any[]) => mockCreateOrder(...args),
      findOrderByClOrdId: (...args: any[]) => mockFindOrderByClOrdId(...args),
    }),
  },
}));

const mockSearch = jest.fn();
const mockQuote = jest.fn();
jest.mock('../services/MarketDataService', () => ({
  ...jest.requireActual('../services/MarketDataService'),
  MarketDataService: {
    search: (...args: any[]) => mockSearch(...args),
    quote: (...args: any[]) => mockQuote(...args),
  },
}));

jest.mock('../services/ConfigService', () => ({
  ConfigService: {
    getConfig: async () => ({ appName: 'OMS', apiBaseUrl: '' }),
    getOrderEntrySessionId: () => 'DESK-1',
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  mockSearch.mockResolvedValue({ instruments: [], source: 'BUILT_IN' });
  mockQuote.mockResolvedValue(null);
  mockFindOrderByClOrdId.mockResolvedValue(null);
});

/** oms-core's refusal of a repeated (sessionId, clOrdId), exactly as CommandDispatcher words it. */
const omsCoreDuplicate = (sessionId: string, clOrdId: string) =>
  `Order creation failed: Duplicate order for sessionId=${sessionId} and clOrdId=${clOrdId}`;

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const type = (label: string, value: string) => fireEvent.change(field(label), { target: { value } });
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Submit order' }));

function fillLimitOrder() {
  type('Symbol', 'AAPL');
  type('Quantity', '100');
  type('Price', '170.5');
  type('Account', 'ACC-1');
}

const sentOrder = (call = 0) => mockCreateOrder.mock.calls[call][0].order;

describe('OrderEntry (SPEC-0072)', () => {
  /** AC-1 */
  it('submits a limit order and shows the new order id', async () => {
    mockCreateOrder.mockResolvedValue({ kind: 'created', orderId: 'ORD-9' });
    render(<OrderEntry lookupDelayMs={0} />);

    fillLimitOrder();
    expect(screen.getByText('BUY 100 AAPL LIMIT 170.5 DAY for ACC-1')).toBeInTheDocument();
    submit();

    expect(await screen.findByText('Order ORD-9 created')).toBeInTheDocument();
    expect(mockCreateOrder).toHaveBeenCalledTimes(1);
    const cmd = mockCreateOrder.mock.calls[0][0];
    expect(cmd.type).toBe('OrderCreateCmd');
    expect(cmd.order).toEqual(expect.objectContaining({
      symbol: 'AAPL', side: 'BUY', ordType: 'LIMIT', orderQty: 100, price: 170.5, account: 'ACC-1',
      timeInForce: 'DAY', sessionId: 'DESK-1',
    }));
    expect(cmd.order.clOrdId).toMatch(/^UI-/);
  });

  /** AC-2 */
  it('marks invalid fields and sends nothing', async () => {
    render(<OrderEntry lookupDelayMs={0} />);

    submit();

    expect(await screen.findByText('Symbol is required')).toBeInTheDocument();
    expect(screen.getByText('Account is required')).toBeInTheDocument();
    expect(screen.getByText('Price is required for LIMIT orders')).toBeInTheDocument();
    expect(field('Symbol')).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(screen.getByLabelText('Order type'), { target: { value: 'STOP' } });
    expect(screen.getByText('Stop price is required for STOP orders')).toBeInTheDocument();
    expect(screen.queryByLabelText('Price')).toBeNull();
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  /** AC-3 */
  it('shows oms-core field errors and keeps the input', async () => {
    mockCreateOrder.mockResolvedValue({
      kind: 'refused', status: 400,
      body: { detail: 'Validation failed for one or more fields', errors: { 'order.price': ['must be greater than 0'] } },
    });
    render(<OrderEntry lookupDelayMs={0} />);
    fillLimitOrder();

    submit();

    expect(await screen.findByText('must be greater than 0')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Validation failed for one or more fields');
    expect(field('Price').value).toBe('170.5');
    expect(field('Symbol').value).toBe('AAPL');
    expect(screen.getByRole('button', { name: 'Submit order' })).toBeEnabled();
  });

  /** AC-3 */
  it('shows a refusal message', async () => {
    mockCreateOrder.mockResolvedValue({ kind: 'refused', status: 400, body: { status: 'FAILED', message: 'Order type is required' } });
    render(<OrderEntry lookupDelayMs={0} />);
    fillLimitOrder();

    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Order type is required');
  });

  /** AC-4 */
  it('a retry keeps the clOrdId, a new order gets a new one', async () => {
    mockCreateOrder
      .mockResolvedValueOnce({ kind: 'network', message: 'Network Error' })
      .mockResolvedValueOnce({ kind: 'created', orderId: 'ORD-1' })
      .mockResolvedValueOnce({ kind: 'created', orderId: 'ORD-2' });
    render(<OrderEntry lookupDelayMs={0} />);
    fillLimitOrder();

    submit();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    await screen.findByText('Order ORD-1 created');
    submit();
    await screen.findByText('Order ORD-2 created');

    expect(sentOrder(1).clOrdId).toBe(sentOrder(0).clOrdId);
    expect(sentOrder(2).clOrdId).not.toBe(sentOrder(1).clOrdId);
  });

  /** AC-4: the earlier attempt of this very ticket was applied. */
  it('resolves its own duplicate refusal', async () => {
    mockCreateOrder.mockImplementation(async (cmd: any) => ({
      kind: 'refused', status: 400,
      body: { status: 'FAILED', message: omsCoreDuplicate('DESK-1', cmd.order.clOrdId) },
    }));
    mockFindOrderByClOrdId.mockResolvedValue({ orderId: 'ORD-7' });
    render(<OrderEntry lookupDelayMs={0} />);
    fillLimitOrder();

    submit();

    expect(await screen.findByText('Order ORD-7 created')).toBeInTheDocument();
    expect(mockFindOrderByClOrdId).toHaveBeenCalledWith(sentOrder(0).clOrdId);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  /**
   * AC-4: after a network error nobody knows whether oms-core applied the order. The next submit asks
   * first, and an order found under the ticket's clOrdId is shown, not sent again — even if the form
   * was edited meanwhile.
   */
  it('after a network error, finds the order the first attempt created instead of sending again', async () => {
    mockCreateOrder.mockResolvedValueOnce({ kind: 'network', message: 'Network Error' });
    mockFindOrderByClOrdId.mockResolvedValue({ orderId: 'ORD-8' });
    render(<OrderEntry lookupDelayMs={0} />);
    fillLimitOrder();

    submit();
    await screen.findByRole('button', { name: 'Retry' });
    type('Price', '171');
    submit();

    expect(await screen.findByText('Order ORD-8 created')).toBeInTheDocument();
    expect(screen.getByText(/by an earlier attempt/)).toBeInTheDocument();
    expect(mockFindOrderByClOrdId).toHaveBeenCalledWith(sentOrder(0).clOrdId);
    expect(mockCreateOrder).toHaveBeenCalledTimes(1);
  });

  /** AC-4: when it cannot be told, the form says so and sends nothing. */
  it('does not guess when the earlier attempt cannot be confirmed', async () => {
    mockCreateOrder
      .mockResolvedValueOnce({ kind: 'network', message: 'Network Error' })
      .mockImplementation(async (cmd: any) => ({
        kind: 'refused', status: 400, body: { status: 'FAILED', message: omsCoreDuplicate('DESK-1', cmd.order.clOrdId) },
      }));
    mockFindOrderByClOrdId.mockRejectedValue(new Error('Network Error'));
    render(<OrderEntry lookupDelayMs={0} />);
    fillLimitOrder();

    submit();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not confirm whether the order was created; check the Orders tab');
    expect(mockCreateOrder).toHaveBeenCalledTimes(1);
  });

  /** AC-4: Reset starts a new ticket, with a new clOrdId and no lookup of the old one. */
  it('a reset gives a new clOrdId', async () => {
    mockCreateOrder
      .mockResolvedValueOnce({ kind: 'network', message: 'Network Error' })
      .mockResolvedValueOnce({ kind: 'created', orderId: 'ORD-4' });
    render(<OrderEntry lookupDelayMs={0} />);
    fillLimitOrder();
    submit();
    await screen.findByRole('button', { name: 'Retry' });

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    fillLimitOrder();
    submit();

    await screen.findByText('Order ORD-4 created');
    expect(sentOrder(1).clOrdId).not.toBe(sentOrder(0).clOrdId);
    expect(mockFindOrderByClOrdId).not.toHaveBeenCalled();
  });

  /** AC-6: a quote that arrives after the symbol changed belongs to another instrument. */
  it('ignores a late quote for a symbol no longer on the form', async () => {
    let answerQuote: (q: unknown) => void = () => undefined;
    mockSearch.mockResolvedValue({ source: 'BUILT_IN', instruments: [{ symbol: 'AAPL', name: 'Apple Inc.' }] });
    mockQuote.mockReturnValue(new Promise(resolve => { answerQuote = resolve; }));
    render(<OrderEntry lookupDelayMs={0} />);
    type('Symbol', 'aa');
    fireEvent.click(await screen.findByRole('option', { name: /AAPL/ }));

    type('Symbol', 'MSFT');
    answerQuote({ symbol: 'AAPL', last: 170, source: 'BUILT_IN' });

    await new Promise(r => setTimeout(r, 20));
    expect(screen.queryByRole('region', { name: 'Quote' })).toBeNull();
  });

  /** AC-4 */
  it('sends once on a double click', async () => {
    let finish: (value: unknown) => void = () => undefined;
    mockCreateOrder.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<OrderEntry lookupDelayMs={0} />);
    fillLimitOrder();

    submit();
    submit();
    finish({ kind: 'created', orderId: 'ORD-3' });

    await screen.findByText('Order ORD-3 created');
    expect(mockCreateOrder).toHaveBeenCalledTimes(1);
  });

  /** AC-5 */
  it('lookup fills symbol and currency', async () => {
    mockSearch.mockResolvedValue({
      source: 'ALPHA_VANTAGE',
      instruments: [{ symbol: 'MSFT', name: 'Microsoft Corporation', region: 'United States', currency: 'USD' }],
    });
    render(<OrderEntry lookupDelayMs={0} />);

    type('Symbol', 'micr');
    fireEvent.click(await screen.findByRole('option', { name: /MSFT.*Microsoft Corporation/ }));

    expect(field('Symbol').value).toBe('MSFT');
    expect(field('Settlement currency').value).toBe('USD');
    expect(mockSearch).toHaveBeenCalledWith('micr');
    await waitFor(() => expect(mockQuote).toHaveBeenCalledWith('MSFT'));
  });

  /** AC-6 */
  it('shows the quote and uses the last price', async () => {
    mockSearch.mockResolvedValue({ source: 'ALPHA_VANTAGE', instruments: [{ symbol: 'IBM', name: 'IBM' }] });
    mockQuote.mockResolvedValue({
      symbol: 'IBM', last: 250.35, change: 1.35, changePercent: 0.5422, high: 251.2, low: 247.5,
      asOf: '2026-11-23', source: 'ALPHA_VANTAGE',
    });
    render(<OrderEntry lookupDelayMs={0} />);
    type('Symbol', 'ib');
    fireEvent.click(await screen.findByRole('option', { name: /IBM/ }));

    const quote = await screen.findByRole('region', { name: 'Quote' });
    expect(within(quote).getByText('250.35')).toBeInTheDocument();
    expect(within(quote).getByText('247.5 – 251.2')).toBeInTheDocument();
    expect(within(quote).getByText('2026-11-23')).toBeInTheDocument();
    expect(within(quote).getAllByText('n/a')).toHaveLength(2);
    fireEvent.click(within(quote).getByRole('button', { name: 'Use last price' }));
    expect(field('Price').value).toBe('250.35');
  });

  /** SPEC-0079 AC-10: a quote from the price service's end-of-day store says so, with its date. */
  it('labels an end-of-day quote with its date', async () => {
    mockSearch.mockResolvedValue({ source: 'REFERENCE_DATA', instruments: [{ symbol: 'IBM', name: 'IBM' }] });
    mockQuote.mockResolvedValue({
      symbol: 'IBM', last: 250.35, previousClose: 249, asOf: '2026-11-25', source: 'END_OF_DAY',
      notice: 'Live price request limit reached: end-of-day close shown',
    });
    render(<OrderEntry lookupDelayMs={0} />);
    type('Symbol', 'ib');
    fireEvent.click(await screen.findByRole('option', { name: /IBM/ }));

    const quote = await screen.findByRole('region', { name: 'Quote' });
    expect(within(quote).getByText('End-of-day close')).toBeInTheDocument();
    expect(within(quote).getByText('2026-11-25')).toBeInTheDocument();
    expect(within(quote).getByText('Live price request limit reached: end-of-day close shown')).toBeInTheDocument();
    fireEvent.click(within(quote).getByRole('button', { name: 'Use last price' }));
    expect(field('Price').value).toBe('250.35');
  });

  /** AC-7 */
  it('works when market data is unavailable', async () => {
    mockSearch.mockResolvedValue({ instruments: [], notice: MARKET_DATA_UNAVAILABLE });
    mockCreateOrder.mockResolvedValue({ kind: 'created', orderId: 'ORD-5' });
    render(<OrderEntry lookupDelayMs={0} />);

    type('Symbol', 'XYZ');
    expect(await screen.findByText(MARKET_DATA_UNAVAILABLE)).toBeInTheDocument();
    type('Quantity', '5');
    type('Price', '10');
    type('Account', 'ACC-2');
    submit();

    expect(await screen.findByText('Order ORD-5 created')).toBeInTheDocument();
    expect(sentOrder().symbol).toBe('XYZ');
  });

  it('remembers accounts for next time', async () => {
    mockCreateOrder.mockResolvedValue({ kind: 'created', orderId: 'ORD-6' });
    const { unmount } = render(<OrderEntry lookupDelayMs={0} />);
    fillLimitOrder();
    submit();
    await screen.findByText('Order ORD-6 created');
    unmount();

    render(<OrderEntry lookupDelayMs={0} />);
    expect(document.querySelector('datalist#order-entry-accounts option')?.getAttribute('value')).toBe('ACC-1');
  });
});
