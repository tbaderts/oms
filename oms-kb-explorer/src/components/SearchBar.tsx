import { useState } from 'react';
import { Search, Sparkles, Hash } from 'lucide-react';
import type { SearchMode } from '../types';

interface SearchBarProps {
  searchMode: SearchMode;
  onSearchModeChange: (mode: SearchMode) => void;
  onSearch: (query: string) => void;
}

export default function SearchBar({ searchMode, onSearchModeChange, onSearch }: SearchBarProps) {
  const [query, setQuery] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(query);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search knowledge base..."
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Search Mode Tabs */}
      <div className="flex space-x-2">
        <button
          type="button"
          onClick={() => onSearchModeChange('keyword')}
          className={`flex items-center space-x-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            searchMode === 'keyword'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          <Hash className="w-4 h-4" />
          <span>Keyword</span>
        </button>
        <button
          type="button"
          onClick={() => onSearchModeChange('semantic')}
          className={`flex items-center space-x-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            searchMode === 'semantic'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Semantic</span>
        </button>
        <button
          type="button"
          onClick={() => onSearchModeChange('hybrid')}
          className={`flex items-center space-x-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            searchMode === 'hybrid'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <Hash className="w-4 h-4 -ml-1" />
          <span>Hybrid ⭐</span>
        </button>
      </div>
    </form>
  );
}
