import React, { useEffect, useRef } from 'react';
import { Container, Terminal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDockerStore } from '@/stores/docker';
import type { DockerContainer } from '@shared/types/docker';

/** Maps a container status to a CSS class for the status dot. */
function statusColor(status: string): string {
  switch (status) {
    case 'running':
      return 'bg-green-500';
    case 'restarting':
      return 'bg-amber-500';
    case 'exited':
    case 'dead':
      return 'bg-red-500';
    default:
      return 'bg-gray-400';
  }
}

function StatusDot({ status }: { status: string }) {
  const testId = `docker-status-${status}`;
  return (
    <span className={`inline-block h-2.5 w-2.5 rounded-full ${statusColor(status)}`} data-testid={testId} />
  );
}

function LogPanel({ container, logs, error, onClose }: { container: string; logs: string | null; error: string | null; onClose: () => void }) {
  return (
    <div className="mt-4 rounded-md border border-border bg-muted/30" data-testid="docker-log-panel">
      <div className="flex items-center justify-between border-b border-border p-2">
        <span className="text-xs font-medium">
          <Terminal className="mr-1 inline h-3 w-3" />
          Logs: <code>{container}</code>
        </span>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close logs">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="max-h-64 overflow-auto p-2">
        {error && <p className="text-xs text-red-500">{error}</p>}
        {!logs && !error && <p className="text-xs text-muted-foreground">Loading…</p>}
        {logs && (
          <pre className="whitespace-pre-wrap break-all font-mono text-xs">{logs}</pre>
        )}
      </div>
    </div>
  );
}

export function DockerView() {
  const {
    containers,
    error,
    connectionLost,
    disabled,
    logsContainer,
    logs,
    logsError,
    load,
    showLogs,
    clearLogs,
    setDisabled,
  } = useDockerStore();

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // On mount: check if Docker is enabled, then start the refresh loop.
  useEffect(() => {
    const configPromise = window.cockpit?.config?.load();
    if (!configPromise) return;

    void configPromise.then((config) => {
      if (!config.infrastructure?.dockerEnabled) {
        setDisabled(true);
        return;
      }
      void load();
      const intervalMs = (config.infrastructure?.dockerRefreshIntervalSeconds ?? 5) * 1000;
      intervalRef.current = setInterval(() => void load(), intervalMs);
    });

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [load, setDisabled]);

  if (disabled) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-muted-foreground">
        <Container className="h-16 w-16 opacity-30" />
        <p className="text-sm">Docker monitoring is disabled. Enable it in Settings → Infrastructure.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-bold">Docker</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Local container status · auto-refreshes
        </p>
      </div>

      {connectionLost && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300" data-testid="docker-connection-lost">
          <Container className="h-3 w-3" />
          Connection lost — retrying…
        </div>
      )}

      {!connectionLost && error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300" data-testid="docker-error">
          {error}
        </div>
      )}

      {!error && !connectionLost && containers === null && (
        <p className="text-sm text-muted-foreground">Loading containers…</p>
      )}

      {containers && (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Image</th>
                <th className="px-3 py-2">Health</th>
                <th className="px-3 py-2">CPU</th>
                <th className="px-3 py-2">Memory</th>
                <th className="px-3 py-2">Ports</th>
                <th className="px-3 py-2">Uptime</th>
              </tr>
            </thead>
            <tbody>
              {containers.map((c: DockerContainer) => (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <StatusDot status={c.status} />
                      <span className="capitalize">{c.status}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      className="font-medium underline decoration-dotted underline-offset-2 hover:decoration-solid"
                      onClick={() => void showLogs(c.name)}
                      data-testid={`docker-container-${c.name}`}
                    >
                      {c.name}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{c.image}</td>
                  <td className="px-3 py-2">{c.health || '—'}</td>
                  <td className="px-3 py-2">{c.cpu || '—'}</td>
                  <td className="px-3 py-2">{c.memory || '—'}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{c.ports || '—'}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{c.state}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {logsContainer && (
        <LogPanel
          container={logsContainer}
          logs={logs}
          error={logsError}
          onClose={clearLogs}
        />
      )}
    </div>
  );
}
