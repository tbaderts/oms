import { useState, type Ref } from 'react';
import { Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { SearchMode } from '../types';
import type { SearchFilters } from '../okf/search';
import { kbApi } from '../services/api';
import { typesPresent } from '../okf/sidebar';

interface SearchBarProps {
  ref?: Ref<HTMLInputElement>;
  mode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
  onSearch: (query: string, filters: SearchFilters) => void;
  /** Esc in the search box: clear the query and results and show the document (AC-7). */
  onClear: () => void;
}

const MODES: { id: SearchMode; label: string; title: string }[] = [
  { id: 'keyword', label: 'Keyword', title: 'Exact words (BM25)' },
  { id: 'semantic', label: 'Semantic', title: 'Similar meaning (embeddings)' },
  { id: 'hybrid', label: 'Hybrid', title: 'Both, rank-fused' },
];

const field = 'h-8 rounded-md border border-input-border bg-input text-sm text-text placeholder:text-muted hover:border-border-hover focus:border-accent focus:outline-none';

/**
 * The search, as one compact bar in the header (SPEC-0066 AC-5): the query, the type and tag
 * filters, and the mode as a segmented control like oms-ui's. Enter searches; switching the mode
 * re-runs an active search.
 */
export default function SearchBar({ ref, mode, onModeChange, onSearch, onClear }: SearchBarProps) {
  const { data: documents } = useQuery({ queryKey: ['documents'], queryFn: () => kbApi.listDocuments() });
  const types = typesPresent(documents ?? []);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [tag, setTag] = useState('');

  return (
    <form
      role="search"
      className="flex min-w-0 flex-1 items-center justify-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(query, { type, tag });
      }}
    >
      <div className="relative w-full max-w-md min-w-48">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          ref={ref}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && query) {
              e.preventDefault();
              setQuery('');
              onClear();
            }
          }}
          placeholder="Search the knowledge base  ( / )"
          aria-label="Search the knowledge base"
          className={`${field} w-full pr-2 pl-8`}
        />
      </div>
      <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by type" className={`${field} px-2`}>
        <option value="">All types</option>
        {types.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={tag}
        onChange={(e) => setTag(e.target.value)}
        placeholder="tag"
        aria-label="Filter by tag"
        className={`${field} w-24 px-2`}
      />
      {/* A segmented control: the active mode is a raised pill in a recessed track (oms-ui's mode toggle) */}
      <div role="group" aria-label="Search mode" className="flex shrink-0 gap-0.5 rounded-md border border-border bg-bg p-0.5">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            title={m.title}
            aria-pressed={mode === m.id}
            onClick={() => onModeChange(m.id)}
            className={`rounded-sm px-3 py-1 text-sm font-medium transition-colors ${
              mode === m.id ? 'bg-accent text-on-accent' : 'text-muted hover:bg-hover hover:text-text'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      {/* Enter in the tag field submits too: a form with two text inputs needs a submit button */}
      <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
    </form>
  );
}
