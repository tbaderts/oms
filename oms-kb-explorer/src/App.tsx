import { useEffect, useReducer, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import AcmeLogo from './components/AcmeLogo';
import SearchBar from './components/SearchBar';
import TreeView from './components/TreeView';
import DocumentViewer from './components/DocumentViewer';
import TableOfContents from './components/TableOfContents';
import SearchResults from './components/SearchResults';
import LinksPanel from './components/LinksPanel';
import { kbApi } from './services/api';
import type { SearchFilters } from './okf/search';
import { docFromLocation, locationForDoc } from './okf/links';
import { INITIAL_SESSION, searchSession } from './okf/searchSession';
import { isSearchShortcut } from './okf/keyboard';
import type { HybridSearchHit, SearchMode } from './types';

const APP_NAME = 'Knowledge Base';

/** Runs one search in the given mode; keyword hits are normalised to the hybrid shape. */
async function runSearch(query: string, filters: SearchFilters, mode: SearchMode): Promise<HybridSearchHit[]> {
  if (mode === 'hybrid') return kbApi.searchHybrid(query, 20, filters);
  if (mode === 'semantic') return kbApi.searchSemantic(query, 20, filters);
  const hits = await kbApi.searchKeyword(query, 20, filters);
  return hits.map((hit) => ({
    path: hit.path,
    keywordScore: hit.score / 100,
    semanticScore: 0,
    hybridScore: hit.score / 100,
    snippet: hit.snippet,
    matchType: 'keyword' as const,
  }));
}

/**
 * The KB explorer (SPEC-0066): the oms-ui shell (Acme Capital header and footer, dark only, the OMS
 * design tokens), a compact search in the header, the tree, the document or the search results, and
 * the TOC with the links panel.
 */
function App({ queryClient }: { queryClient?: QueryClient }) {
  const [client] = useState(() => queryClient ?? new QueryClient());
  // A deep link ?doc=<path>#anchor opens that document on load
  const [initial] = useState(() => docFromLocation(window.location.search, window.location.hash));
  const [selectedDoc, setSelectedDoc] = useState<string | null>(initial.path);
  const [selectedAnchor, setSelectedAnchor] = useState<string | undefined>(initial.anchor);
  const [session, dispatch] = useReducer(searchSession, INITIAL_SESSION);
  const searchRef = useRef<HTMLInputElement>(null);

  // Dark only, like oms-ui
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  // Run the search the session asks for; an answer to an older request is ignored by the reducer
  const { request, query, filters, mode, status } = session;
  useEffect(() => {
    if (status !== 'loading') return;
    let active = true;
    runSearch(query, filters, mode).then(
      (results) => active && dispatch({ type: 'succeeded', request, results }),
      (err: unknown) => active && dispatch({ type: 'failed', request, message: err instanceof Error ? err.message : String(err) }),
    );
    return () => {
      active = false;
    };
    // `request` identifies the search; the other values belong to it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  // "/" focuses the search unless the user is typing in a field (AC-7)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isSearchShortcut(e)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Browser Back/Forward: show the document the URL now names
  useEffect(() => {
    const onPopState = () => {
      const { path, anchor } = docFromLocation(window.location.search, window.location.hash);
      setSelectedDoc(path);
      setSelectedAnchor(anchor);
      dispatch({ type: 'openResult' });
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  /** Opening a document (tree, link, result) keeps the search results for "Back to results" (AC-6). */
  const handleSelectDoc = (path: string, anchor?: string) => {
    setSelectedDoc(path);
    setSelectedAnchor(anchor);
    window.history.pushState(null, '', locationForDoc(path, anchor));
    dispatch({ type: 'openResult' });
  };

  const showingResults = session.query !== '' && session.showing === 'results';
  const canGoBack = session.query !== '' && session.showing === 'document' && session.status !== 'idle';

  return (
    <QueryClientProvider client={client}>
      <div className="flex h-screen flex-col bg-bg font-sans text-text">
        <header className="flex h-14 shrink-0 items-center justify-between gap-6 border-b border-border bg-surface px-5">
          <div className="flex shrink-0 items-center gap-4 text-strong">
            <AcmeLogo width={140} height={35} className="block" />
            <span className="h-6 w-px bg-border-strong" aria-hidden="true" />
            <h1 className="m-0 text-lg font-medium text-muted">{APP_NAME}</h1>
          </div>
          <SearchBar
            ref={searchRef}
            mode={session.mode}
            onModeChange={(m) => dispatch({ type: 'modeChanged', mode: m })}
            onSearch={(q, f) => dispatch({ type: 'submit', query: q, filters: f })}
            onClear={() => dispatch({ type: 'clear' })}
          />
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="w-72 shrink-0 overflow-y-auto border-r border-border bg-surface" aria-label="Documents">
            <TreeView onSelectDoc={handleSelectDoc} selectedDoc={selectedDoc} />
          </aside>

          <main className="flex min-w-0 flex-1 flex-col bg-bg">
            {showingResults ? (
              <section className="min-h-0 flex-1 overflow-y-auto" aria-label="Search results">
                <SearchResults
                  status={session.status}
                  error={session.error}
                  results={session.results}
                  searchQuery={session.query}
                  searchMode={session.mode}
                  onSelectDoc={handleSelectDoc}
                  onRetry={() => dispatch({ type: 'retry' })}
                />
              </section>
            ) : (
              <>
                {canGoBack && (
                  <div className="flex shrink-0 items-center border-b border-border bg-surface px-6 py-1.5">
                    <button
                      type="button"
                      onClick={() => dispatch({ type: 'backToResults' })}
                      className="inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-sm text-accent hover:bg-hover hover:text-accent-hover"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      Back to results ({session.results.length}) for “{session.query}”
                    </button>
                  </div>
                )}
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <DocumentViewer selectedDoc={selectedDoc} anchor={selectedAnchor} onSelectDoc={handleSelectDoc} />
                </div>
              </>
            )}
          </main>

          {selectedDoc && !showingResults && (
            <aside className="w-64 shrink-0 overflow-y-auto border-l border-border bg-surface" aria-label="On this page">
              <TableOfContents documentPath={selectedDoc} />
              <LinksPanel documentPath={selectedDoc} onSelectDoc={handleSelectDoc} />
            </aside>
          )}
        </div>

        <footer className="flex h-8 shrink-0 items-center justify-between border-t border-border bg-surface px-5 text-xs text-muted">
          <span>
            © {new Date().getFullYear()} Acme Capital · {APP_NAME}
          </span>
          <span className="truncate pl-4">
            {showingResults
              ? session.status === 'done'
                ? `${session.results.length} results for “${session.query}”`
                : ''
              : selectedDoc
                ? selectedDoc.replace(/^oms-knowledge-base\//, '')
                : 'No document selected'}
          </span>
        </footer>
      </div>
    </QueryClientProvider>
  );
}

export default App;
