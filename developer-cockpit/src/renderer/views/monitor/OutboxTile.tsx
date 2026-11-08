import React from 'react';
import { useMonitorStore } from '@/stores/monitor';

/** Formats seconds as mm:ss (AC-5). */
function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Outbox headline: pending, stuck, and the age of the oldest pending row as mm:ss (AC-5). */
export function OutboxTile() {
  const parsed = useMonitorStore((s) => s.sample?.parsed ?? null);
  const outbox = parsed?.outbox;
  return (
    <div className="rounded-lg border p-4" data-testid="monitor-outbox">
      <h3 className="mb-2 text-sm font-semibold">Outbox</h3>
      <dl className="space-y-1 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Pending</dt>
          <dd className="tabular-nums font-medium">{outbox ? outbox.pending : '–'}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Stuck</dt>
          <dd className="tabular-nums font-medium">{outbox ? outbox.stuck : '–'}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Oldest age</dt>
          <dd className="tabular-nums font-medium">
            {outbox && outbox.oldestAgeSeconds !== null ? formatDuration(outbox.oldestAgeSeconds) : '–'}
          </dd>
        </div>
      </dl>
    </div>
  );
}
