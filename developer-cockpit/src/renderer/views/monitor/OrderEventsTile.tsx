import React from 'react';
import { useMonitorStore } from '@/stores/monitor';

/**
 * Total order events appended plus a per-minute rate (AC-3). The rate is derived from the
 * accumulated counter across the samples observed so far (the store keeps a running baseline).
 */
export function OrderEventsTile() {
  const parsed = useMonitorStore((s) => s.sample?.parsed ?? null);
  const total = parsed?.eventsTotal ?? 0;
  // The store exposes the rate computed from the first successful sample to now.
  const rate = useMonitorStore((s) => s.eventsPerMinute);

  return (
    <div className="rounded-lg border p-4" data-testid="monitor-order-events">
      <h3 className="mb-2 text-sm font-semibold">Order events</h3>
      <div className="text-2xl font-semibold tabular-nums">{total}</div>
      <div className="text-xs text-muted-foreground">
        {rate !== null ? `${rate}/min` : '—/min'}
      </div>
    </div>
  );
}
