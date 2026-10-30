import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { useSignalsStore } from '@/stores/signals';
import { openTicket } from '@/lib/open-ticket';
import { SignalLevelIcon } from './SignalLevelIcon';
import type { Signal } from '@/lib/signals';

const TOAST_MS = 8000;

/** New critical and attention signals as toasts above the status bar (SPEC-0016). */
export function Toaster() {
  const toasts = useSignalsStore((s) => s.toasts);
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed bottom-8 right-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((t) => <Toast key={t.key} signal={t} />)}
    </div>
  );
}

function Toast({ signal }: { signal: Signal }) {
  const dismiss = useSignalsStore((s) => s.dismissToast);
  useEffect(() => {
    const timer = setTimeout(() => dismiss(signal.key), TOAST_MS);
    return () => clearTimeout(timer);
  }, [dismiss, signal.key]);

  return (
    <div role="status" className="pointer-events-auto flex items-start gap-3 rounded-lg border bg-popover p-3 text-sm text-popover-foreground shadow-lg">
      <SignalLevelIcon level={signal.level} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{signal.level}</span>
          <span className="font-mono text-xs text-muted-foreground">{signal.ticketId}</span>
        </div>
        <div className="break-words">{signal.text}</div>
        <div className="truncate text-xs text-muted-foreground">{signal.title}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          className="rounded px-2 py-0.5 text-xs font-medium text-primary hover:bg-accent"
          onClick={() => {
            dismiss(signal.key);
            openTicket(signal.ticketId);
          }}
        >
          Open
        </button>
        <button aria-label="Dismiss" className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => dismiss(signal.key)}>
          <X aria-hidden className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
