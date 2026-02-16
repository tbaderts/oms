import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Moon, Sun, FileText } from 'lucide-react';
import SearchBar from './components/SearchBar';
import TreeView from './components/TreeView';
import DocumentViewer from './components/DocumentViewer';
import TableOfContents from './components/TableOfContents';
import SearchResults from './components/SearchResults';
import { kbApi } from './services/api';
import type { SearchMode, ThemeMode, HybridSearchHit } from './types';

const queryClient = new QueryClient();

function App() {
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState<SearchMode>('keyword');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<HybridSearchHit[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Apply theme to document root element
  useEffect(() => {
    const root = document.documentElement;
    console.log('Applying theme:', theme);

    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }

    console.log('Document classes after update:', root.className);
  }, [theme]);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    console.log('Toggling theme from', theme, 'to', newTheme);
    setTheme(newTheme);
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      let results: HybridSearchHit[];

      if (searchMode === 'hybrid') {
        results = await kbApi.searchHybrid(query, 20);
      } else if (searchMode === 'keyword') {
        const keywordResults = await kbApi.searchKeyword(query, 20);
        // Convert SearchHit to HybridSearchHit format
        results = keywordResults.map(hit => ({
          path: hit.path,
          keywordScore: hit.score / 100, // Normalize score to 0-1
          semanticScore: 0,
          hybridScore: hit.score / 100,
          snippet: hit.snippet,
          matchType: 'keyword' as const,
        }));
      } else {
        // Semantic search - uses dedicated semantic endpoint
        results = await kbApi.searchSemantic(query, 20);
      }

      setSearchResults(results);
    } catch (error) {
      console.error('Search failed:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectDoc = (path: string) => {
    setSelectedDoc(path);
    setSearchQuery(''); // Clear search when selecting a document
    setSearchResults([]);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex flex-col h-screen bg-white dark:bg-gray-900">
          {/* Header */}
          <header className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <FileText className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  OMS Knowledge Base Explorer
                </h1>
              </div>
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? (
                  <Sun className="w-5 h-5 text-gray-400" />
                ) : (
                  <Moon className="w-5 h-5 text-gray-600" />
                )}
              </button>
            </div>
          </header>

          {/* Search Bar */}
          <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3">
            <SearchBar
              searchMode={searchMode}
              onSearchModeChange={setSearchMode}
              onSearch={handleSearch}
            />
          </div>

          {/* Main Content */}
          <div className="flex flex-1 overflow-hidden">
            {/* Left Sidebar - Document Tree */}
            <aside className="w-64 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-y-auto">
              <TreeView
                onSelectDoc={handleSelectDoc}
                selectedDoc={selectedDoc}
              />
            </aside>

            {/* Center - Document Viewer or Search Results */}
            <main className="flex-1 overflow-y-auto bg-white dark:bg-gray-900">
              {searchQuery ? (
                <SearchResults
                  results={searchResults}
                  searchQuery={searchQuery}
                  searchMode={searchMode}
                  onSelectDoc={handleSelectDoc}
                />
              ) : (
                <DocumentViewer
                  selectedDoc={selectedDoc}
                  searchQuery={searchQuery}
                />
              )}
              {isSearching && (
                <div className="absolute inset-0 bg-white dark:bg-gray-900 bg-opacity-50 flex items-center justify-center">
                  <div className="text-gray-600 dark:text-gray-400">Searching...</div>
                </div>
              )}
            </main>

            {/* Right Sidebar - Table of Contents */}
            {selectedDoc && !searchQuery && (
              <aside className="w-64 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-y-auto">
                <TableOfContents documentPath={selectedDoc} />
              </aside>
            )}
          </div>

          {/* Footer */}
          <footer className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2">
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>OMS Knowledge Base Explorer v1.0</span>
              <span>
                {searchQuery
                  ? `Search: "${searchQuery}" (${searchResults.length} results)`
                  : selectedDoc
                    ? `Viewing: ${selectedDoc.split('/').pop()}`
                    : 'No document selected'}
              </span>
            </div>
          </footer>
        </div>
    </QueryClientProvider>
  );
}

export default App;
