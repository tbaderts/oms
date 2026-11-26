import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, FileText, Folder, Layers } from 'lucide-react';
import type { KbCategory, KbTreeEntry, KbTypeGroup } from '@shared/types/kb';
import { useKnowledgeBaseStore, type KbTreeView } from '@/stores/knowledgeBase';
import { cn } from '@/lib/utils';
import { CategoryTree } from './CategoryTree';

interface KbTreeProps {
  categories: KbCategory[];
  onSelect: (path: string) => void;
}

const VIEWS: { id: KbTreeView; label: string; icon: typeof Folder }[] = [
  { id: 'folders', label: 'Folders', icon: Folder },
  { id: 'types', label: 'Types', icon: Layers },
];

/**
 * The knowledge base tree: browse by folder, or by OKF type as in the OKF explorer (capabilities by
 * maturity, requirements functional / non-functional). The type groups load when first shown.
 */
export function KbTree({ categories, onSelect }: KbTreeProps) {
  const { treeView, setTreeView, typeGroups, loadTypeGroups } = useKnowledgeBaseStore();
  const [typesLoaded, setTypesLoaded] = useState(false);

  useEffect(() => {
    if (treeView !== 'types') return;
    let current = true;
    void loadTypeGroups().then(() => {
      if (current) setTypesLoaded(true);
    });
    return () => {
      current = false;
    };
    // Reload when the folders change too (a rescan after fixing indexes).
  }, [treeView, categories, loadTypeGroups]);

  return (
    <div className="space-y-2">
      <div role="group" aria-label="Browse the knowledge base by" className="flex gap-0.5 rounded-md border border-border p-0.5">
        {VIEWS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTreeView(id)}
            aria-pressed={treeView === id}
            className={cn(
              'flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors',
              treeView === id ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-accent',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {treeView === 'folders' ? (
        <CategoryTree categories={categories} onSelect={onSelect} />
      ) : !typesLoaded && typeGroups.length === 0 ? null : typeGroups.length === 0 ? (
        <p className="px-2 py-4 text-sm text-muted-foreground">No documents found</p>
      ) : (
        <div className="space-y-1">
          {typeGroups.map((group) => (
            <TypeSection key={group.type} group={group} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

function TypeSection({ group, onSelect }: { group: KbTypeGroup; onSelect: (path: string) => void }) {
  const [expanded, setExpanded] = useState(true);
  // A subgroup gets a heading only when it adds something: several of them, or a label of its own.
  const labelled = group.subgroups.length > 1 || group.subgroups[0]?.label !== group.type;
  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 rounded px-2 py-1 text-sm font-medium hover:bg-accent"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Layers className="h-4 w-4 text-muted-foreground" />
        <span className="flex-1 text-left truncate">{group.type}</span>
        <span className="text-xs font-normal text-muted-foreground">{group.count}</span>
      </button>
      {expanded && (
        <div className="ml-4 space-y-0.5">
          {group.subgroups.map((sub) => (
            <div key={sub.label}>
              {labelled && <div className="px-2 pt-1.5 text-[11px] font-medium text-muted-foreground">{sub.label}</div>}
              {sub.documents.map((doc) => (
                <EntryButton key={doc.path} entry={doc} onSelect={onSelect} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** A document, looking like one in the folder tree, deprecated ones struck through. */
function EntryButton({ entry, onSelect }: { entry: KbTreeEntry; onSelect: (path: string) => void }) {
  const deprecated = entry.status === 'deprecated';
  return (
    <button
      onClick={() => onSelect(entry.path)}
      title={entry.relativePath}
      className="flex w-full items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent"
    >
      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
      <span className={cn('flex-1 text-left truncate', deprecated && 'text-muted-foreground line-through')}>{entry.label}</span>
      {deprecated && (
        <span className="text-[10px] text-muted-foreground" title="Superseded; see the archive banner">deprecated</span>
      )}
    </button>
  );
}
