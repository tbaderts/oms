import React from 'react';
import { useConnectionStatus } from '@/hooks/useEventBus';
import { useConfigStore } from '@/stores/config';
import { cn } from '@/lib/utils';

export function StatusBar() {
  const connected = useConnectionStatus();
  const workspaceRoot = useConfigStore((s) => s.config.general.workspaceRoot);

  return (
    <footer className="flex h-6 items-center justify-between border-t border-border bg-muted px-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'inline-block h-2 w-2 rounded-full',
            connected ? 'bg-success' : 'bg-destructive',
          )}
          title={connected ? 'Connected' : 'Disconnected'}
        />
        <span>{connected ? 'Connected' : 'Disconnected'}</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="truncate max-w-80" title={workspaceRoot}>{workspaceRoot}</span>
      </div>
    </footer>
  );
}
