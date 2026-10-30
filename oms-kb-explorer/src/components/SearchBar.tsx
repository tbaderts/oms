import { useState } from 'react';
import { Search, Sparkles, Hash } from 'lucide-react';
import type { SearchMode } from '../types';
import type { SearchFilters } from '../okf/search';
import { useQuery } from '@tanstack/react-query';
import { kbApi } from '../services/api';
import { typesPresent } from '../okf/sidebar';

interface SearchBarProps {
  searchMode: SearchMode;
  onSearchModeChange: (mode: SearchMode) => void;
  onSearch: (query: string, filters: SearchFilters) => void;
}

export default function SearchBar({ searchMode, onSearchModeChange, onSearch }: SearchBarProps) {
  const { data: documents } = useQuery({ queryKey: ['documents'], queryFn: () => kbApi.listDocuments() });
  const types = typesPresent(documents ?? []);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [tag, setTag] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(query, { type, tag });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Search Input */}
      {/* With two text inputs, Enter only submits the form when it has a submit button */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search knowledge base..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          Search
        </button>
      </div>

      {/* Search Mode Tabs and OKF filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          aria-label="Filter by type"
          className="px-2 py-1.5 rounded-md text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        >
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <input
          type="text"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          placeholder="tag"
          aria-label="Filter by tag"
          className="w-32 px-2 py-1.5 rounded-md text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
        />
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
