import React, { useState } from 'react';
import { useRequirementsStore } from '@/stores/requirements';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Maturity } from '@shared/types/requirements';

export const MATURITY_VARIANT: Record<Maturity, 'default' | 'secondary' | 'outline'> = {
  implemented: 'default',
  partial: 'secondary',
  planned: 'outline',
};

/** The capability catalogue (SPEC-0061): what the project does, how built it is, and what it links. */
export function CapabilitiesTab() {
  const capabilities = useRequirementsStore((s) => s.capabilities);
  const useCases = useRequirementsStore((s) => s.useCases);
  const functionalReqs = useRequirementsStore((s) => s.functionalReqs);
  const nonFunctionalReqs = useRequirementsStore((s) => s.nonFunctionalReqs);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = capabilities.find((c) => c.id === selectedId);

  if (capabilities.length === 0) {
    return <p className="py-8 text-center text-muted-foreground">No capabilities found in the knowledge base.</p>;
  }

  const useCaseTitle = (id: string) => useCases.find((u) => u.id === id)?.title;
  const requirementTitle = (id: string) =>
    functionalReqs.find((r) => r.id === id)?.title ?? nonFunctionalReqs.find((r) => r.id === id)?.title;

  return (
    <div className="mt-4 flex gap-4">
      <div className="flex-1">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Capability</TableHead>
              <TableHead className="w-32">Maturity</TableHead>
              <TableHead className="w-24 text-right">Use cases</TableHead>
              <TableHead className="w-28 text-right">Requirements</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {capabilities.map((cap) => (
              <TableRow
                key={cap.id}
                onClick={() => setSelectedId(cap.id)}
                className={`cursor-pointer ${selectedId === cap.id ? 'bg-accent' : ''}`}
              >
                <TableCell>
                  <div className="font-medium">{cap.title}</div>
                  <div className="text-xs text-muted-foreground line-clamp-2">{cap.description}</div>
                </TableCell>
                <TableCell>
                  <Badge variant={MATURITY_VARIANT[cap.maturity] ?? 'outline'}>{cap.maturity}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{cap.useCases.length}</TableCell>
                <TableCell className="text-right tabular-nums">{cap.requirements.length}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {selected && (
        <Card className="w-96 shrink-0" aria-label="Capability details">
          <CardHeader>
            <CardTitle className="text-base">{selected.title}</CardTitle>
            <p className="text-sm text-muted-foreground">{selected.description}</p>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {selected.commands.length > 0 && (
              <div>
                <h4 className="mb-1 font-medium">Commands</h4>
                <div className="flex flex-wrap gap-1">
                  {selected.commands.map((c) => <Badge key={c} variant="secondary" className="font-mono">{c}</Badge>)}
                </div>
              </div>
            )}
            <div>
              <h4 className="mb-1 font-medium">Use cases</h4>
              <ul className="space-y-0.5 text-muted-foreground">
                {selected.useCases.map((id) => <li key={id}><span className="font-mono">{id}</span> {useCaseTitle(id)}</li>)}
              </ul>
            </div>
            <div>
              <h4 className="mb-1 font-medium">Requirements</h4>
              <ul className="space-y-0.5 text-muted-foreground">
                {selected.requirements.map((id) => <li key={id}><span className="font-mono">{id}</span> {requirementTitle(id)}</li>)}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
