import React, { useEffect } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMonitorStore } from '@/stores/monitor';
import { ServiceBoard, openLink } from './ServiceBoard';
import { PanelGrid } from './PanelGrid';
import { StatusTimeline } from './StatusTimeline';

function formatTimestamp(ms: number | null): string {
  return ms === null ? '—' : new Date(ms).toLocaleTimeString();
}

/**
 * The Monitoring view (SPEC-0076): the services and metric panels the project lists in its
 * `cockpit.yaml`, polled every `intervalSeconds` while the view is open. Service tiles show a
 * response-time sparkline and the recent checks; status changes are listed in a timeline.
 */
export function MonitorView() {
  const { config, poll, history, timeline, panels, error, connectionLost, refreshing, lastUpdated, start, stop, refresh } = useMonitorStore();

  useEffect(() => {
    void start();
    return () => stop();
  }, [start, stop]);

  const services = config?.monitoring.services ?? [];
  const checks = poll?.checks ?? [];
  const up = checks.filter((c) => c.status === 'UP').length;
  const empty = !!config && config.errors.length === 0 && services.length === 0 && config.monitoring.panels.length === 0;

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Monitoring</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {config?.projectName ?? 'Project'} · every {config?.monitoring.intervalSeconds ?? 10}s · last updated {formatTimestamp(lastUpdated)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {services.length > 0 && poll && (
            <div className="text-right" data-testid="monitor-summary">
              <div className={`text-2xl font-semibold tabular-nums ${up === services.length ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {up} of {services.length} up
              </div>
            </div>
          )}
          {config?.links.map((l) => (
            <Button key={l.url} size="sm" variant="outline" onClick={() => openLink(l.url)}>
              {l.label}
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          ))}
          <Button size="sm" variant="secondary" onClick={() => void refresh()} disabled={refreshing} data-testid="monitor-refresh">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {config && config.errors.length > 0 && (
        <div role="alert" className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive" data-testid="monitor-config-errors">
          <div className="font-medium">{config.file} is not valid, so nothing is monitored:</div>
          <ul className="mt-1 list-disc pl-5 font-mono text-xs">
            {config.errors.map((e, i) => (
              <li key={i}>
                {e.path ? `${e.path}: ` : ''}
                {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && !poll && (
        <div role="alert" className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive" data-testid="monitor-error">
          {error}
        </div>
      )}

      {connectionLost && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300" data-testid="monitor-connection-lost">
          The last poll failed — showing data from {formatTimestamp(lastUpdated)}. Retrying…
        </div>
      )}

      {empty && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground" data-testid="monitor-empty">
          <p className="font-medium text-foreground">No services configured</p>
          <p className="mt-1">
            Add a <code>monitoring</code> section with <code>services</code> and <code>panels</code> to <code className="break-all">{config.file}</code>
            {config.present ? '' : ' (the file does not exist yet)'}.
          </p>
        </div>
      )}

      {services.length > 0 && <ServiceBoard services={services} checks={checks} history={history} />}

      {(panels.length > 0 || (poll && services.length > 0)) && (
        <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[1fr_22rem]">
          <div>{panels.length > 0 && <PanelGrid panels={panels} />}</div>
          {services.length > 0 && <StatusTimeline entries={timeline} />}
        </div>
      )}

      {!config && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
    </div>
  );
}
