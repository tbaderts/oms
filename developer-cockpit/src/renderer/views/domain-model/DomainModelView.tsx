import React, { useEffect, useState } from 'react';
import { useSpecsStore } from '@/stores/specs';
import { EntityCard } from './EntityCard';
import { EntityRelationships } from './EntityRelationships';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { RefreshCw } from 'lucide-react';

type FilterKind = 'all' | 'record' | 'enum' | 'command';

const FILTERS: { label: string; value: FilterKind }[] = [
  { label: 'All', value: 'all' },
  { label: 'Records', value: 'record' },
  { label: 'Enums', value: 'enum' },
  { label: 'Commands', value: 'command' },
];

export function DomainModelView() {
  const { entities, loading, loadEntities } = useSpecsStore();
  const [filter, setFilter] = useState<FilterKind>('all');

  useEffect(() => {
    loadEntities();
  }, [loadEntities]);

  const filtered = filter === 'all' ? entities : entities.filter((e) => e.kind === filter);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-6 py-3">
        <h2 className="text-lg font-medium">Domain Model</h2>
        <div className="flex gap-1 rounded-md border border-border p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                filter === f.value
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <span className="text-sm text-muted-foreground">{filtered.length} entities</span>
        <Button size="sm" variant="outline" onClick={loadEntities}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <LoadingSpinner />
      ) : (
        <div className="flex-1 overflow-auto p-6">
          <div className="mb-6">
            <EntityRelationships entities={filtered} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((entity) => (
              <EntityCard key={`${entity.source}-${entity.name}`} entity={entity} />
            ))}
          </div>
          {filtered.length === 0 && (
            <div className="flex h-48 items-center justify-center text-muted-foreground">
              No entities found for this filter.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
