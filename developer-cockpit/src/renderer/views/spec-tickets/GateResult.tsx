import React from 'react';
import type { SpecGateResult } from '@shared/types/specTickets';
import { Badge } from '@/components/ui/badge';

/** `draft`: the result is for unsaved editor text, not for the file on disk. */
export function GateResult({ gate, draft = false }: { gate: SpecGateResult | null; draft?: boolean }) {
  if (!gate) return <p className="text-sm text-muted-foreground">No gate at this stage.</p>;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <span>Gate <span className="font-mono">{gate.stage}</span></span>
        <Badge variant={gate.pass ? 'secondary' : 'destructive'}>{gate.pass ? 'PASS' : 'FAIL'}</Badge>
        {draft && <Badge variant="outline">draft (unsaved)</Badge>}
        {gate.exceptions.length > 0 && (
          <Badge variant="outline">policy exceptions: {gate.exceptions.join(', ')}</Badge>
        )}
      </div>
      {gate.errors.length > 0 && (
        <ul className="space-y-0.5 text-xs text-destructive">
          {gate.errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
      {gate.warnings.length > 0 && (
        <ul className="space-y-0.5 text-xs text-amber-600 dark:text-amber-400">
          {gate.warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}
    </div>
  );
}
