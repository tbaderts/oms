import React, { useState, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { useKnowledgeBaseStore } from '@/stores/knowledgeBase';
import { Input } from '@/components/ui/input';

interface KbSearchBarProps {
  onSelect: (path: string) => void;
}

export function KbSearchBar({ onSelect }: KbSearchBarProps) {
  const { searchResults, searchQuery, search, clearSearch } = useKnowledgeBaseStore();
  const [showResults, setShowResults] = useState(false);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      search(e.target.value);
      setShowResults(true);
    },
    [search],
  );

  const handleSelect = (path: string) => {
    onSelect(path);
    setShowResults(false);
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search docs..."
          value={searchQuery}
          onChange={handleChange}
          onFocus={() => setShowResults(true)}
          className="pl-8 pr-8 h-8 text-sm"
        />
        {searchQuery && (
          <button
            onClick={() => {
              clearSearch();
              setShowResults(false);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2"
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        )}
      </div>

      {showResults && searchResults.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
          {searchResults.map((result) => (
            <button
              key={result.document.path}
              onClick={() => handleSelect(result.document.path)}
              className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <span className="font-medium">{result.document.title}</span>
              <span className="text-xs text-muted-foreground">{result.document.category}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
