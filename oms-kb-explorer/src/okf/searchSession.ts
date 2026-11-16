import type { HybridSearchHit, SearchMode } from '../types/index.ts';
import type { SearchFilters } from './search.ts';

/**
 * The search session (SPEC-0066): what was searched, how it went, and whether the results or the
 * document is showing. A pure reducer, so the rules (kept results, re-run on mode change, clear)
 * are testable without a DOM. `request` numbers each search; an answer to an older one is ignored.
 */
export interface SearchSession {
  query: string;
  filters: SearchFilters;
  mode: SearchMode;
  status: 'idle' | 'loading' | 'done' | 'error';
  /** Increments with every search started; the effect runs the search for this number. */
  request: number;
  results: HybridSearchHit[];
  error: string | null;
  /** Results stay in the session while a document opened from them is showing (AC-6). */
  showing: 'results' | 'document';
}

export type SearchAction =
  | { type: 'submit'; query: string; filters: SearchFilters }
  | { type: 'modeChanged'; mode: SearchMode }
  | { type: 'succeeded'; request: number; results: HybridSearchHit[] }
  | { type: 'failed'; request: number; message: string }
  | { type: 'retry' }
  | { type: 'openResult' }
  | { type: 'backToResults' }
  | { type: 'clear' };

export const INITIAL_SESSION: SearchSession = {
  query: '',
  filters: {},
  mode: 'keyword',
  status: 'idle',
  request: 0,
  results: [],
  error: null,
  showing: 'document',
};

const start = (s: SearchSession, patch: Partial<SearchSession> = {}): SearchSession => ({
  ...s,
  ...patch,
  status: 'loading',
  request: s.request + 1,
  error: null,
  showing: 'results',
});

export function searchSession(s: SearchSession, action: SearchAction): SearchSession {
  switch (action.type) {
    case 'submit': {
      const query = action.query.trim();
      // An empty query clears; moving past the current request also drops an answer still in flight.
      if (!query) return { ...INITIAL_SESSION, mode: s.mode, request: s.request + 1 };
      return start(s, { query, filters: action.filters, results: [] });
    }
    case 'modeChanged':
      // With an active query the search runs again in the new mode (AC-5).
      return s.query ? start(s, { mode: action.mode }) : { ...s, mode: action.mode };
    case 'retry':
      return s.query ? start(s) : s;
    case 'succeeded':
      return action.request === s.request ? { ...s, status: 'done', results: action.results } : s;
    case 'failed':
      return action.request === s.request ? { ...s, status: 'error', results: [], error: action.message } : s;
    case 'openResult':
      return { ...s, showing: 'document' };
    case 'backToResults':
      return s.query ? { ...s, showing: 'results' } : s;
    case 'clear':
      return { ...INITIAL_SESSION, mode: s.mode, request: s.request + 1 };
  }
}
