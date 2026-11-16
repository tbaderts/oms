import { AlertTriangle, FileText, Loader2, RotateCcw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { HybridSearchHit, SearchMode } from '../types';
import type { SearchSession } from '../okf/searchSession';
import { kbApi } from '../services/api';
import { decorateHits } from '../okf/search';
import { StatusPill, ToneBadge, TrustPill, TypePill, type Tone } from './Badges';

interface SearchResultsProps {
  status: SearchSession['status'];
  error: string | null;
  results: HybridSearchHit[];
  searchQuery: string;
  searchMode: SearchMode;
  onSelectDoc: (path: string) => void;
  onRetry: () => void;
}

const MATCH: Record<string, { tone: Tone; label: string }> = {
  hybrid: { tone: 'accent', label: 'Hybrid' },
  keyword: { tone: 'info', label: 'Keyword' },
  semantic: { tone: 'violet', label: 'Semantic' },
  'keyword-only': { tone: 'neutral', label: 'Keyword only' },
};

/**
 * The knowledge server's scores are reciprocal-rank-fusion values (about 1/61 for the best hit), not
 * relevance percentages, so a hit is shown by its rank. In hybrid mode, which signals found it.
 */
function matchedBy(hit: HybridSearchHit): string {
  const keyword = hit.keywordScore > 0;
  const meaning = hit.semanticScore > 0;
  if (keyword && meaning) return 'Matched by keyword and meaning';
  return keyword ? 'Matched by keyword only' : 'Matched by meaning only';
}

/**
 * The results of the current search (SPEC-0066): progress, an inline error with Retry, or the hits.
 * Each hit opens its document; the session keeps the results for "Back to results" (AC-6, AC-8).
 */
export default function SearchResults({ status, error, results, searchQuery, searchMode, onSelectDoc, onRetry }: SearchResultsProps) {
  const { data: documents } = useQuery({ queryKey: ['documents'], queryFn: () => kbApi.listDocuments() });
  const decorated = decorateHits(results, documents ?? []);

  if (status === 'loading') {
    return (
      <div role="status" className="flex items-center gap-2 px-6 py-4 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin text-accent" />
        Searching for “{searchQuery}”…
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="p-6">
        <div role="alert" className="flex items-start gap-3 rounded-md border border-danger bg-danger-bg px-4 py-3 text-sm text-text">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <div className="flex-1">
            <p className="font-medium text-strong">Search failed</p>
            <p className="text-muted">{error}</p>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1 rounded-sm border border-border-strong px-2 py-1 text-xs text-text hover:bg-hover"
          >
            <RotateCcw className="h-3 w-3" /> Retry
          </button>
        </div>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="px-6 py-10 text-center">
        <FileText className="mx-auto mb-3 h-8 w-8 text-muted" />
        <p className="text-md font-medium text-strong">No results for “{searchQuery}”</p>
        <p className="mt-1 text-sm text-muted">Try other words, remove a filter, or switch to Semantic or Hybrid search.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between border-b border-border bg-surface px-6 py-3">
        <p className="text-sm text-text">
          {results.length} {results.length === 1 ? 'document' : 'documents'} for <span className="font-medium text-strong">“{searchQuery}”</span>
        </p>
        <span className="text-xs text-muted">{MATCH[searchMode]?.label ?? searchMode} search</span>
      </div>

      <ul className="space-y-2 p-4">
        {decorated.map((result, index) => {
          const match = MATCH[result.matchType] ?? MATCH.keyword;
          return (
            <li key={`${result.path}-${index}`}>
              <button
                type="button"
                data-testid="search-result"
                onClick={() => onSelectDoc(result.path)}
                className="block w-full rounded-md border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-accent hover:bg-raised focus-visible:border-accent"
              >
                <div className="mb-1 flex items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate text-md font-medium text-strong">{result.title}</span>
                  <ToneBadge tone={match.tone}>{match.label}</ToneBadge>
                </div>
                <div className="mb-1.5 flex flex-wrap items-center gap-1">
                  <TypePill type={result.type} />
                  <StatusPill status={result.status} />
                  <TrustPill tier={result.trustTier} />
                  <span className="truncate font-mono text-2xs text-muted">{result.path.replace(/^oms-knowledge-base\//, '')}</span>
                </div>
                {result.snippet && <p className="line-clamp-2 text-sm text-text">…{result.snippet}…</p>}
                <div className="mt-1.5 flex gap-3 text-2xs text-muted">
                  <span data-testid="result-rank" className="font-medium text-text">#{index + 1}</span>
                  {searchMode === 'hybrid' && <span>{matchedBy(result)}</span>}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
