import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useMonitorStore } from '@/stores/monitor';

/**
 * The raw `/actuator/prometheus` text in a read-only, selectable pane (AC-9). Collapsed by default
 * (it can be large); a "truncated" notice appears when the 5 MB cap cut it.
 */
export function RawPrometheusPane() {
  const metrics = useMonitorStore((s) => s.sample?.metrics ?? null);
  const [open, setOpen] = useState(false);
  const raw = metrics?.raw ?? null;

  return (
    <div className="rounded-md border border-border" data-testid="monitor-raw-pane">
      <button
        className="flex w-full items-center justify-between p-2 text-left text-xs font-medium hover:bg-accent"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="monitor-raw-content"
      >
        <span>Raw Prometheus text{metrics?.truncated ? ' (truncated)' : ''}</span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div id="monitor-raw-content" className="border-t border-border">
          {raw ? (
            <>
              {metrics?.truncated && (
                <p className="p-2 text-xs text-amber-600 dark:text-amber-400" data-testid="monitor-truncated-notice">
                  Response truncated to the 5 MB limit.
                </p>
              )}
              <pre className="max-h-96 overflow-auto p-2 font-mono text-xs whitespace-pre-wrap break-all">{raw}</pre>
            </>
          ) : (
            <p className="p-2 text-xs text-muted-foreground">No metrics data.</p>
          )}
        </div>
      )}
    </div>
  );
}
