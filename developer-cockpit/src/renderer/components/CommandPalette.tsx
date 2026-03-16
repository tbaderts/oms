import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import Fuse from 'fuse.js';
import { NAV_ITEMS, useNavigationStore, type ViewId } from '@/stores/navigation';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const setActiveView = useNavigationStore((s) => s.setActiveView);

  const fuse = useMemo(() => new Fuse(NAV_ITEMS, {
    keys: ['label', 'group'],
    threshold: 0.4,
  }), []);

  const results = useMemo(() => {
    if (!query.trim()) return NAV_ITEMS;
    return fuse.search(query).map((r) => r.item);
  }, [query, fuse]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  const handleSelect = (id: ViewId) => {
    setActiveView(id);
    onOpenChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      handleSelect(results[selectedIndex].id);
    } else if (e.key === 'Escape') {
      onOpenChange(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      <div className="fixed inset-0 bg-black/50" onClick={() => onOpenChange(false)} />
      <div className="relative z-10 w-full max-w-lg rounded-lg border border-border bg-popover shadow-2xl">
        <div className="flex items-center border-b border-border px-3">
          <Search className="mr-2 h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command or search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-11 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          {results.map((item, index) => (
            <button
              key={item.id}
              onClick={() => handleSelect(item.id)}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm ${
                index === selectedIndex
                  ? 'bg-accent text-accent-foreground'
                  : 'text-popover-foreground hover:bg-accent/50'
              }`}
            >
              <span className="flex-1 text-left">{item.label}</span>
              <span className="text-xs text-muted-foreground">{item.group}</span>
            </button>
          ))}
          {results.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">No results found</div>
          )}
        </div>
      </div>
    </div>
  );
}
