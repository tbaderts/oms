import React from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useApiExplorerStore } from '@/stores/apiExplorer';

const time = (iso: string) => new Date(iso).toLocaleString();

/** Requests sent from the explorer, newest first; any of them can be put back (SPEC-0007 AC-8). */
export function HistoryTab() {
  const { history, restore, clearHistory } = useApiExplorerStore();

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium">Sent requests</h2>
        <span className="text-xs text-muted-foreground">last {history.length} of at most 100</span>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={() => void clearHistory()} disabled={history.length === 0}>
          <Trash2 className="mr-1 h-3.5 w-3.5" />
          Clear history
        </Button>
      </div>

      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">No requests sent yet.</p>
      ) : (
        <ul aria-label="Request history" className="divide-y rounded-md border">
          {history.map((h) => (
            <li key={h.id} data-id={h.id} className="flex items-center gap-3 px-3 py-2 text-xs">
              <span className="w-40 shrink-0 text-muted-foreground">{time(h.at)}</span>
              <span className="w-48 shrink-0 truncate font-mono">{h.label}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground" title={`${h.method} ${h.path}`}>
                {`${h.method} ${h.path}`}
              </span>
              {h.refused ? (
                <Badge variant="outline" title="Refused before sending">
                  refused
                </Badge>
              ) : h.status === null ? (
                <Badge variant="destructive">unreachable</Badge>
              ) : (
                <Badge variant={h.status < 400 ? 'secondary' : 'destructive'} className="font-mono">
                  {h.status}
                </Badge>
              )}
              <Button size="sm" variant="ghost" className="h-7" aria-label={`Restore ${h.label} from ${time(h.at)}`} onClick={() => restore(h)}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                Restore
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
