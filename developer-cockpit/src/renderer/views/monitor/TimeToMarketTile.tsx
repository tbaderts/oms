import React from 'react';
import { useMonitorStore } from '@/stores/monitor';

/** p99 time-to-market in ms, 1 decimal (AC-4); "–" when no usable histogram buckets were seen. */
export function TimeToMarketTile() {
  const parsed = useMonitorStore((s) => s.sample?.parsed ?? null);
  const ms = parsed?.timeToMarketP99Ms ?? null;
  return (
    <div className="rounded-lg border p-4" data-testid="monitor-time-to-market">
      <h3 className="mb-2 text-sm font-semibold">Time to market</h3>
      <div className="text-2xl font-semibold tabular-nums">
        {ms !== null ? ms.toFixed(1) : '–'}
        {ms !== null && <span className="ml-1 text-sm font-normal text-muted-foreground">ms</span>}
      </div>
      <div className="text-xs text-muted-foreground">p99 (approx.)</div>
    </div>
  );
}
