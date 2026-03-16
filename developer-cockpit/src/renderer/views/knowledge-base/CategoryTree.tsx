import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, FileText, Folder } from 'lucide-react';
import type { KbCategory } from '@shared/types/kb';
import type { KbDocument } from '@shared/types/kb';
import { cn } from '@/lib/utils';

interface CategoryTreeProps {
  categories: KbCategory[];
  onSelect: (path: string) => void;
}

export function CategoryTree({ categories, onSelect }: CategoryTreeProps) {
  if (categories.length === 0) {
    return <p className="px-2 py-4 text-sm text-muted-foreground">No categories found</p>;
  }

  return (
    <div className="space-y-1">
      {categories.map((cat) => (
        <CategoryNode key={cat.name} category={cat} onSelect={onSelect} />
      ))}
    </div>
  );
}

function CategoryNode({ category, onSelect }: { category: KbCategory; onSelect: (path: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [documents, setDocuments] = useState<KbDocument[]>([]);

  useEffect(() => {
    if (expanded && documents.length === 0) {
      window.cockpit.kb.getDocuments(category.name).then(setDocuments).catch(() => {});
    }
  }, [expanded, category.name, documents.length]);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Folder className="h-4 w-4 text-muted-foreground" />
        <span className="flex-1 text-left truncate">{category.name}</span>
        <span className="text-xs text-muted-foreground">{category.documentCount}</span>
      </button>

      {expanded && (
        <div className="ml-4 space-y-0.5">
          {category.subcategories.map((sub) => (
            <CategoryNode key={sub.name} category={sub} onSelect={onSelect} />
          ))}
          {documents.map((doc) => (
            <button
              key={doc.path}
              onClick={() => onSelect(doc.path)}
              className="flex w-full items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent"
            >
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="flex-1 text-left truncate">{doc.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
