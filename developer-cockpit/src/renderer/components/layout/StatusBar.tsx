import React from 'react';
import { Bell } from 'lucide-react';
import { useConnectionStatus } from '@/hooks/useEventBus';
import { useConfigStore } from '@/stores/config';
import { useSignalsStore } from '@/stores/signals';
import { useNavigationStore } from '@/stores/navigation';
import { cn } from '@/lib/utils';

export function StatusBar() {
  const connected = useConnectionStatus();
  const workspaceRoot = useConfigStore((s) => s.config.general.workspaceRoot);

  return (
    <footer className="flex h-6 items-center justify-between gap-4 border-t border-border bg-muted px-3 text-xs text-muted-foreground">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              'inline-block h-2 w-2 rounded-full',
              connected ? 'bg-success' : 'bg-destructive',
            )}
            title={connected ? 'Connected' : 'Disconnected'}
          />
          <span>{connected ? 'Connected' : 'Disconnected'}</span>
        </div>
        <SignalsIndicator />
      </div>
      <div className="flex min-w-0 items-center gap-4">
        <span className="truncate max-w-80" title={workspaceRoot}>{workspaceRoot}</span>
      </div>
    </footer>
  );
}

/** Unseen critical and attention signals; a click opens the Dashboard and acknowledges them. */
function SignalsIndicator() {
  const unseen = useSignalsStore((s) => s.unseen);
  if (!unseen.length) return null;
  const latest = unseen[0];
  const critical = unseen.some((s) => s.level === 'critical');
  return (
    <button
      aria-label={`${unseen.length} new signal${unseen.length === 1 ? '' : 's'}`}
      title="Open the Dashboard"
      className="flex min-w-0 items-center gap-1.5 rounded px-1.5 text-foreground hover:bg-accent"
      onClick={() => {
        useNavigationStore.getState().setActiveView('dashboard');
        useSignalsStore.getState().markSeen();
      }}
    >
      <Bell aria-hidden className={cn('h-3.5 w-3.5 shrink-0', critical ? 'text-destructive' : 'text-warning')} />
      <span className="font-semibold tabular-nums">{unseen.length}</span>
      <span className="max-w-96 truncate text-muted-foreground">{latest.ticketId} {latest.text}</span>
    </button>
  );
}
