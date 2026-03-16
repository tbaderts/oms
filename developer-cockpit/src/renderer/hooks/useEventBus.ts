import { useEffect, useState } from 'react';
import { eventBus } from '@/lib/event-bus';
import type { CockpitEvent, EventType } from '@shared/types/events';

export function useEventBus(type: EventType | '*', handler: (event: CockpitEvent) => void): void {
  useEffect(() => {
    return eventBus.on(type, handler);
  }, [type, handler]);
}

export function useConnectionStatus(): boolean {
  const [connected, setConnected] = useState(eventBus.connected);

  useEffect(() => {
    return eventBus.on('connection:status', (event) => {
      setConnected((event.payload as { connected: boolean }).connected);
    });
  }, []);

  return connected;
}
