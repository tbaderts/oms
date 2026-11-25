import React from 'react';
import type { TimelineEntry } from '@/stores/monitor';
import { STATUS_TONE } from './charts';

/** Status changes seen while the view was open, newest first. */
export function StatusTimeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <div className="rounded-lg border bg-card p-4" data-testid="status-timeline">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Status changes</div>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">No changes since the view opened.</p>
      ) : (
        <ol className="max-h-64 space-y-1.5 overflow-auto">
          {entries.map((e, i) => (
            <li key={`${e.service}-${e.at}-${i}`} className="flex items-center gap-2 text-xs" data-testid="timeline-entry">
              <span className="w-16 shrink-0 tabular-nums text-muted-foreground">{new Date(e.at).toLocaleTimeString()}</span>
              <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${STATUS_TONE[e.to].dot}`} />
              <span className="font-medium">{e.service}</span>
              <span className="text-muted-foreground">
                {e.from} → {e.to}
              </span>
              {e.reason && (
                <span className="truncate text-muted-foreground" title={e.reason}>
                  · {e.reason}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
