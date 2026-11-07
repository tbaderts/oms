import React from 'react';

/**
 * The oms-core health indicator (AC-1). A coloured badge showing the actuator health status
 * (UP / DOWN / OUT_OF_SERVICE). `status` is the top-level status from `/actuator/health`.
 */
export function HealthTile({ status, url }: { status: string | null; url: string }) {
  const tone =
    status === 'UP'
      ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
      : status === 'DOWN'
        ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
        : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300';
  const dot =
    status === 'UP' ? 'bg-green-500' : status === 'DOWN' ? 'bg-red-500' : 'bg-amber-500';

  return (
    <div
      data-testid="monitor-health"
      data-status={status ?? 'unknown'}
      className={`flex items-center gap-3 rounded-lg border p-4 ${tone}`}
    >
      <span aria-hidden className={`h-3 w-3 rounded-full ${dot}`} />
      <div className="min-w-0">
        <div className="text-lg font-semibold">{status ?? 'unknown'}</div>
        <div className="truncate text-xs opacity-80">{url}</div>
      </div>
    </div>
  );
}
