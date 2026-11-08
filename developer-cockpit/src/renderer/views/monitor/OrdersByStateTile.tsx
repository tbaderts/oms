import React from 'react';
import type { OrderStateCount } from '@shared/types/monitor';

/** One row per order state with its current count (AC-2). Zero-value states are absent. */
export function OrdersByStateTile({ states }: { states: OrderStateCount[] | null }) {
  if (!states || states.length === 0) {
    return (
      <div className="rounded-lg border p-4 text-sm text-muted-foreground" data-testid="monitor-orders-by-state">
        Orders by state
        <p className="mt-1">No order data.</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border p-4" data-testid="monitor-orders-by-state">
      <h3 className="mb-2 text-sm font-semibold">Orders by state</h3>
      <ul className="space-y-1">
        {states.map((s) => (
          <li key={s.state} className="flex items-center justify-between text-sm">
            <span className="font-mono text-xs">{s.state}</span>
            <span className="tabular-nums font-medium">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
