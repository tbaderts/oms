import { useEffect } from 'react';
import { useSpecTicketsStore } from '@/stores/specTickets';
import { useSignalsStore } from '@/stores/signals';
import { useSpecTicketsLiveRefresh } from '@/hooks/useSpecTicketsLiveRefresh';

/**
 * Keeps the tickets live in every view and feeds each successful load into the signals store, so
 * the status bar and toasts react while the user is elsewhere. Mounted once in App; renders nothing.
 */
export function SignalsWatcher() {
  useSpecTicketsLiveRefresh();

  useEffect(() => {
    const ingest = useSignalsStore.getState().ingest;
    const unsubscribe = useSpecTicketsStore.subscribe((s, prev) => {
      if (s.tickets !== prev.tickets && !s.error) ingest(s.tickets);
    });
    useSpecTicketsStore.getState().load();
    return unsubscribe;
  }, []);

  return null;
}
