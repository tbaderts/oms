import { useCallback } from 'react';
import { useEventBus } from '@/hooks/useEventBus';
import { useSpecTicketsStore } from '@/stores/specTickets';

/** Re-reads tickets whenever anything under specs/changes or specs/archive changes on disk. */
export function useSpecTicketsLiveRefresh(): void {
  const handler = useCallback(() => {
    useSpecTicketsStore.getState().refresh();
  }, []);
  useEventBus('specs:tickets-changed', handler);
}
