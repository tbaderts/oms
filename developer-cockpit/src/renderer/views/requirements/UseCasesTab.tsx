import React, { useState } from 'react';
import { useRequirementsStore } from '@/stores/requirements';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

export function UseCasesTab() {
  const useCases = useRequirementsStore((s) => s.useCases);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useCases.find((uc) => uc.id === selectedId);

  if (useCases.length === 0) {
    return <p className="py-8 text-center text-muted-foreground">No use cases found in the knowledge base.</p>;
  }

  return (
    <div className="flex gap-4 mt-4">
      <ScrollArea className="w-72 shrink-0">
        <div className="space-y-1">
          {useCases.map((uc) => (
            <button
              key={uc.id}
              onClick={() => setSelectedId(uc.id)}
              className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                selectedId === uc.id ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
              }`}
            >
              <div className="font-medium">{uc.id}</div>
              <div className="text-xs text-muted-foreground truncate">{uc.title}</div>
            </button>
          ))}
        </div>
      </ScrollArea>

      <div className="flex-1">
        {selected ? (
          <Card>
            <CardHeader>
              <CardTitle>{selected.id}: {selected.title}</CardTitle>
              <div className="flex gap-2">
                {selected.actors.map((a) => (
                  <Badge key={a} variant="secondary">{a}</Badge>
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <h4 className="font-medium mb-1">Description</h4>
                <p className="text-muted-foreground">{selected.description}</p>
              </div>
              {selected.preconditions.length > 0 && (
                <div>
                  <h4 className="font-medium mb-1">Preconditions</h4>
                  <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                    {selected.preconditions.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
              )}
              {selected.mainFlow.length > 0 && (
                <div>
                  <h4 className="font-medium mb-1">Main Flow</h4>
                  <ol className="list-decimal pl-5 text-muted-foreground space-y-1">
                    {selected.mainFlow.map((step, i) => <li key={i}>{step}</li>)}
                  </ol>
                </div>
              )}
              {selected.postconditions.length > 0 && (
                <div>
                  <h4 className="font-medium mb-1">Postconditions</h4>
                  <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                    {selected.postconditions.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="flex h-48 items-center justify-center text-muted-foreground">
            Select a use case to view details
          </div>
        )}
      </div>
    </div>
  );
}
