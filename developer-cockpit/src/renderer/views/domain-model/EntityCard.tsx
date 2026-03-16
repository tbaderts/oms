import React from 'react';
import type { DomainEntity } from '@shared/types/specs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface EntityCardProps {
  entity: DomainEntity;
}

const KIND_COLORS: Record<string, string> = {
  record: 'text-blue-400 border-blue-400',
  enum: 'text-purple-400 border-purple-400',
  command: 'text-amber-400 border-amber-400',
};

const SOURCE_COLORS: Record<string, string> = {
  openapi: 'text-emerald-400 border-emerald-400',
  avro: 'text-cyan-400 border-cyan-400',
};

export function EntityCard({ entity }: EntityCardProps) {
  const isEnum = entity.kind === 'enum';

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">{entity.name}</CardTitle>
        </div>
        <div className="flex gap-1.5">
          <Badge variant="outline" className={KIND_COLORS[entity.kind] || ''}>
            {entity.kind}
          </Badge>
          <Badge variant="outline" className={SOURCE_COLORS[entity.source] || ''}>
            {entity.source}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        {isEnum ? (
          <div className="text-sm text-muted-foreground">
            {entity.fields.map((f, i) => (
              <span key={f.name}>
                {i > 0 && ', '}
                <span className="font-medium text-purple-300">{f.name}</span>
              </span>
            ))}
          </div>
        ) : (
          <div className="space-y-0.5">
            {entity.fields.slice(0, 12).map((field) => (
              <div key={field.name} className="flex items-center gap-1.5 text-xs">
                <span className="text-foreground">{field.name}</span>
                <span className="text-muted-foreground">:</span>
                {field.isRef ? (
                  <span className="font-medium text-blue-400">{field.refTarget}</span>
                ) : (
                  <span className="text-muted-foreground">{field.type}</span>
                )}
                {field.required && (
                  <span className="text-red-400" title="Required">*</span>
                )}
              </div>
            ))}
            {entity.fields.length > 12 && (
              <p className="text-xs text-muted-foreground">
                ... +{entity.fields.length - 12} more fields
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
