import React, { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMonitorStore, REFRESH_INTERVAL_MS } from '@/stores/monitor';
import { HealthTile } from './HealthTile';
import { OrdersByStateTile } from './OrdersByStateTile';
import { OrderEventsTile } from './OrderEventsTile';
import { TimeToAckTile } from './TimeToAckTile';
import { TimeToMarketTile } from './TimeToMarketTile';
import { OutboxTile } from './OutboxTile';
import { RawPrometheusPane } from './RawPrometheusPane';

function formatTimestamp(ms: number | null): string {
  if (ms === null) return '—';
  return new Date(ms).toLocaleTimeString();
}

/**
 * The Monitoring view (SPEC-0053): oms-core's actuator health + the OMS-domain metrics, polled
 * every 10 s while open (design → Decision 4). Self-contained — it reads only `monitor:*` IPC and
 * the `useMonitorStore`; no other view's state (AC-10).
 */
export function MonitorView() {
  const { sample, error, connectionLost, refreshing, lastUpdated, startAutoRefresh, stopAutoRefresh, manualRefresh } =
    useMonitorStore();

  // Start the auto-refresh on mount; stop it on unmount (AC-7).
  useEffect(() => {
    startAutoRefresh(REFRESH_INTERVAL_MS);
    return () => stopAutoRefresh();
  }, [startAutoRefresh, stopAutoRefresh]);

  const healthStatus = sample?.health?.body?.status ?? null;
  const url = sample?.url || 'http://localhost:8090';

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Monitoring</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            oms-core actuator · auto-refreshes every {REFRESH_INTERVAL_MS / 1000}s · last updated {formatTimestamp(lastUpdated)}
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => void manualRefresh()} disabled={refreshing} data-testid="monitor-refresh">
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* A first-ever failure (no sample yet): a destructive error banner naming the URL (AC-6). */}
      {!connectionLost && error && !sample && (
        <div role="alert" className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive" data-testid="monitor-error">
          {error}
        </div>
      )}

      {/* A later failure with a previous good sample: keep the sample, mark it stale (AC-6). */}
      {connectionLost && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300" data-testid="monitor-connection-lost">
          Connection lost — showing the last sample from {formatTimestamp(lastUpdated)}. Retrying…
        </div>
      )}

      {sample && (
        <>
          <HealthTile status={healthStatus} url={url} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <OrdersByStateTile states={sample.parsed?.ordersByState ?? null} />
            <OrderEventsTile />
            <TimeToAckTile />
            <TimeToMarketTile />
            <OutboxTile />
          </div>
          <RawPrometheusPane />
        </>
      )}

      {!sample && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
    </div>
  );
}
