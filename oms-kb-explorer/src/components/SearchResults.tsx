import { FileText, TrendingUp, Zap } from 'lucide-react';
import type { HybridSearchHit } from '../types';

interface SearchResultsProps {
  results: HybridSearchHit[];
  searchQuery: string;
  searchMode: 'keyword' | 'semantic' | 'hybrid';
  onSelectDoc: (path: string) => void;
}

export default function SearchResults({ results, searchQuery, searchMode, onSelectDoc }: SearchResultsProps) {
  if (!searchQuery) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <Zap className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
        <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Search the Knowledge Base
        </h3>
        <p className="text-gray-500 dark:text-gray-400 max-w-md">
          Enter a search query above and choose a search mode to find relevant documents.
        </p>
        <div className="mt-6 space-y-2 text-sm text-left">
          <div className="flex items-start space-x-2">
            <span className="font-semibold text-blue-600 dark:text-blue-400">Keyword:</span>
            <span className="text-gray-600 dark:text-gray-400">Fast exact text matching</span>
          </div>
          <div className="flex items-start space-x-2">
            <span className="font-semibold text-purple-600 dark:text-purple-400">Semantic:</span>
            <span className="text-gray-600 dark:text-gray-400">AI-powered meaning-based search</span>
          </div>
          <div className="flex items-start space-x-2">
            <span className="font-semibold text-green-600 dark:text-green-400">Hybrid:</span>
            <span className="text-gray-600 dark:text-gray-400">Best of both worlds</span>
          </div>
        </div>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <FileText className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
        <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
          No results found
        </h3>
        <p className="text-gray-500 dark:text-gray-400 max-w-md">
          No documents match your search for "<span className="font-semibold">{searchQuery}</span>".
          Try different keywords or switch to a different search mode.
        </p>
      </div>
    );
  }

  const getMatchTypeBadge = (matchType: string) => {
    const badges = {
      'hybrid': { color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', label: 'Hybrid' },
      'keyword': { color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', label: 'Keyword' },
      'semantic': { color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200', label: 'Semantic' },
      'keyword-only': { color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200', label: 'Keyword Only' },
    };
    const badge = badges[matchType as keyof typeof badges] || badges['keyword'];
    return (
      <span className={`text-xs px-2 py-1 rounded-full ${badge.color}`}>
        {badge.label}
      </span>
    );
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600 dark:text-green-400';
    if (score >= 0.6) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-gray-600 dark:text-gray-400';
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Search Results
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Found {results.length} {results.length === 1 ? 'document' : 'documents'} matching "{searchQuery}"
            </p>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            {searchMode} mode
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {results.map((result, index) => (
          <div
            key={`${result.path}-${index}`}
            onClick={() => onSelectDoc(result.path)}
            className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 bg-white dark:bg-gray-800 cursor-pointer transition-all hover:shadow-md"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center space-x-2 flex-1 min-w-0">
                <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {result.path.split('/').pop()?.replace('.md', '')}
                </h3>
              </div>
              {getMatchTypeBadge(result.matchType)}
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-mono truncate">
              {result.path}
            </p>

            {result.snippet && (
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-3 line-clamp-2">
                ...{result.snippet}...
              </p>
            )}

            <div className="flex items-center space-x-4 text-xs">
              {searchMode === 'hybrid' ? (
                <>
                  <div className="flex items-center space-x-1">
                    <TrendingUp className="w-3 h-3 text-blue-500" />
                    <span className="text-gray-600 dark:text-gray-400">Keyword:</span>
                    <span className={`font-semibold ${getScoreColor(result.keywordScore)}`}>
                      {(result.keywordScore * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Zap className="w-3 h-3 text-purple-500" />
                    <span className="text-gray-600 dark:text-gray-400">Semantic:</span>
                    <span className={`font-semibold ${getScoreColor(result.semanticScore)}`}>
                      {(result.semanticScore * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <span className="text-gray-600 dark:text-gray-400">Combined:</span>
                    <span className={`font-semibold ${getScoreColor(result.hybridScore)}`}>
                      {(result.hybridScore * 100).toFixed(0)}%
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex items-center space-x-1">
                  <TrendingUp className="w-3 h-3 text-blue-500" />
                  <span className="text-gray-600 dark:text-gray-400">Relevance:</span>
                  <span className={`font-semibold ${getScoreColor(result.keywordScore || result.hybridScore)}`}>
                    {((result.keywordScore || result.hybridScore) * 100).toFixed(0)}%
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
