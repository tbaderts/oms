// MarketDataService.ts - instrument lookup and quotes for order entry (SPEC-0072)
//
// Asks oms-ui's own backend (oms-marketdata-api.yml), which forwards to the price service (SPEC-0079):
// it holds the provider's key and falls back to end-of-day closes. When either cannot be reached
// (e.g. the React dev server, which proxies to oms-core), the form shows a notice and the symbol can
// still be typed by hand.
import { ConfigService } from './ConfigService';

// END_OF_DAY: the price service's last known close (asOf is its date); REFERENCE_DATA: its instrument
// list (SPEC-0079). BUILT_IN is no longer sent; kept for older answers.
export type MarketDataSource = 'ALPHA_VANTAGE' | 'BUILT_IN' | 'END_OF_DAY' | 'REFERENCE_DATA';

export interface Instrument {
  symbol: string;
  name?: string;
  type?: string;
  region?: string;
  currency?: string;
}

export interface InstrumentSearchResult {
  instruments: Instrument[];
  source?: MarketDataSource;
  /** Why the built-in list (or nothing) was used. */
  notice?: string;
}

export interface Quote {
  symbol: string;
  last?: number;
  change?: number;
  changePercent?: number;
  high?: number;
  low?: number;
  previousClose?: number;
  bid?: number;
  ask?: number;
  currency?: string;
  asOf?: string;
  source?: MarketDataSource;
  notice?: string;
}

export const MARKET_DATA_UNAVAILABLE = 'Market data unavailable: enter the symbol by hand';

const base = () => `${ConfigService.getContextPath()}/api/market-data`;

async function getJson(url: string): Promise<{ status: number; body?: any }> {
  const response = await fetch(url);
  return { status: response.status, body: response.ok ? await response.json() : undefined };
}

export const MarketDataService = {
  /** Instruments matching part of a symbol or name; never throws. */
  async search(query: string): Promise<InstrumentSearchResult> {
    try {
      const { status, body } = await getJson(`${base()}/instruments?query=${encodeURIComponent(query)}`);
      if (status === 200 && body && Array.isArray(body.instruments)) {
        return body as InstrumentSearchResult;
      }
    } catch {
      // the backend cannot be reached: fall through to the notice
    }
    return { instruments: [], notice: MARKET_DATA_UNAVAILABLE };
  },

  /** The latest quote; null for a symbol nobody prices; a notice when it cannot ask. Never throws. */
  async quote(symbol: string): Promise<Quote | null> {
    try {
      const { status, body } = await getJson(`${base()}/quotes/${encodeURIComponent(symbol)}`);
      if (status === 200 && body) return body as Quote;
      if (status === 404) return null;
    } catch {
      // the backend cannot be reached: fall through to the notice
    }
    return { symbol, notice: MARKET_DATA_UNAVAILABLE };
  },
};
