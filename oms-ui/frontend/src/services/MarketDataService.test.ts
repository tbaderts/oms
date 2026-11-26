// MarketDataService.test.ts - instrument lookup and quotes from oms-ui's backend (SPEC-0072)
import { MarketDataService, MARKET_DATA_UNAVAILABLE } from './MarketDataService';

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as any).fetch = fetchMock;
});

const answer = (status: number, body: unknown) => Promise.resolve({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(body),
});

describe('MarketDataService.search (SPEC-0072 AC-5, AC-7)', () => {
  it('asks oms-ui\'s backend and returns its answer', async () => {
    fetchMock.mockReturnValue(answer(200, {
      source: 'ALPHA_VANTAGE',
      instruments: [{ symbol: 'MSFT', name: 'Microsoft Corporation', currency: 'USD' }],
    }));

    const result = await MarketDataService.search('micro soft');

    expect(fetchMock).toHaveBeenCalledWith('/api/market-data/instruments?query=micro%20soft');
    expect(result.source).toBe('ALPHA_VANTAGE');
    expect(result.instruments[0].symbol).toBe('MSFT');
  });

  it('passes the built-in fallback and its notice through', async () => {
    fetchMock.mockReturnValue(answer(200, {
      source: 'BUILT_IN', notice: 'Market data provider not configured', instruments: [{ symbol: 'AAPL' }],
    }));

    expect((await MarketDataService.search('aa')).notice).toBe('Market data provider not configured');
  });

  it('reports unavailable when the backend cannot be reached or answers an error', async () => {
    fetchMock.mockReturnValueOnce(Promise.reject(new TypeError('Failed to fetch')));
    expect(await MarketDataService.search('aa')).toEqual({ instruments: [], notice: MARKET_DATA_UNAVAILABLE });

    fetchMock.mockReturnValueOnce(answer(404, {}));
    expect(await MarketDataService.search('aa')).toEqual({ instruments: [], notice: MARKET_DATA_UNAVAILABLE });
  });
});

describe('MarketDataService.quote (SPEC-0072 AC-6, AC-7)', () => {
  it('returns the quote', async () => {
    fetchMock.mockReturnValue(answer(200, { symbol: 'IBM', last: 250.35, source: 'ALPHA_VANTAGE' }));

    expect(await MarketDataService.quote('IBM')).toEqual(expect.objectContaining({ symbol: 'IBM', last: 250.35 }));
    expect(fetchMock).toHaveBeenCalledWith('/api/market-data/quotes/IBM');
  });

  it('returns null for an unknown symbol and an unavailable notice when it cannot ask', async () => {
    fetchMock.mockReturnValueOnce(answer(404, {}));
    expect(await MarketDataService.quote('ZZZZ')).toBeNull();

    fetchMock.mockReturnValueOnce(Promise.reject(new TypeError('Failed to fetch')));
    expect(await MarketDataService.quote('AAPL')).toEqual({ symbol: 'AAPL', notice: MARKET_DATA_UNAVAILABLE });
  });
});

// SPEC-0079 AC-10: oms-ui answers 503 when the price service cannot be reached.
describe('MarketDataService with the price service down (SPEC-0079)', () => {
  it('a 503 gives the unavailable notice for search and quote', async () => {
    const problem = { type: 'urn:oms:error:price-service-unavailable', status: 503 };
    fetchMock.mockReturnValueOnce(answer(503, problem));
    expect(await MarketDataService.search('aa')).toEqual({ instruments: [], notice: MARKET_DATA_UNAVAILABLE });

    fetchMock.mockReturnValueOnce(answer(503, problem));
    expect(await MarketDataService.quote('AAPL')).toEqual({ symbol: 'AAPL', notice: MARKET_DATA_UNAVAILABLE });
  });

  it('passes an end-of-day quote through with its date and notice', async () => {
    fetchMock.mockReturnValue(answer(200, {
      symbol: 'IBM', last: 250.35, asOf: '2026-11-25', source: 'END_OF_DAY',
      notice: 'Live price request limit reached: end-of-day close shown',
    }));

    expect(await MarketDataService.quote('IBM')).toEqual(expect.objectContaining({ source: 'END_OF_DAY', asOf: '2026-11-25' }));
  });
});
