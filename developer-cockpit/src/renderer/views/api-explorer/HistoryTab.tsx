import React from 'react';
import { Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useApiExplorerStore } from '@/stores/apiExplorer';
import { MethodTag } from './OperationsList';

const time = (iso: string) => new Date(iso).toLocaleString();

/** Requests sent from the explorer, newest first; any of them can be put back in the editor. */
export function HistoryTab() {
  const { history, restore, clearHistory } = useApiExplorerStore();

  return (
    <div className="space-y-2 p-2">
      <div className="flex items-center gap-2 px-2">
        <span className="text-xs text-muted-foreground">last {history.length} of at most 100</span>
        <div className="flex-1" />
        <Button size="sm" variant="outline" className="h-7" onClick={() => void clearHistory()} disabled={history.length === 0}>
          <Trash2 className="mr-1 h-3.5 w-3.5" />
          Clear
        </Button>
      </div>

      {history.length === 0 ? (
        <p className="px-2 text-xs text-muted-foreground">No requests sent yet.</p>
      ) : (
        <ul aria-label="Request history" className="space-y-0.5">
          {history.map((h) => (
            <li key={h.id} data-id={h.id}>
              <button
                type="button"
                aria-label={`Restore ${h.label} from ${time(h.at)}`}
                onClick={() => restore(h)}
                className="w-full rounded px-2 py-1 text-left hover:bg-accent"
              >
                <div className="flex items-baseline gap-1">
                  <MethodTag method={h.method} />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs" title={h.url ?? h.path}>
                    {h.path}
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
                </div>
                <div className="truncate pl-[3.75rem] text-[11px] text-muted-foreground">
                  {time(h.at)} · {h.label}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
