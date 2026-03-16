import React from 'react';
import type { DomainEntity } from '@shared/types/specs';

interface EntityRelationshipsProps {
  entities: DomainEntity[];
}

export function EntityRelationships({ entities }: EntityRelationshipsProps) {
  const entitiesWithRefs = entities.filter((e) => e.references.length > 0);
  if (entitiesWithRefs.length === 0) return null;

  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="mb-3 text-sm font-medium text-foreground">Entity References</h3>
      <div className="space-y-1.5">
        {entitiesWithRefs.map((entity) => (
          <div key={entity.name} className="flex items-center gap-2 text-xs">
            <span className="font-medium text-foreground">{entity.name}</span>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-blue-400">{entity.references.join(', ')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
