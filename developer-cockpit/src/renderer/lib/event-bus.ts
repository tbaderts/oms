import type { CockpitEvent, EventType } from '@shared/types/events';

type EventHandler = (event: CockpitEvent) => void;

class EventBus {
  private ws: WebSocket | null = null;
  private listeners = new Map<EventType | '*', Set<EventHandler>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private url: string = '';
  private _connected = false;

  get connected(): boolean {
    return this._connected;
  }

  connect(url: string): void {
    this.url = url;
    this.doConnect();
  }

  private doConnect(): void {
    if (this.ws) {
      this.ws.close();
    }

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this._connected = true;
      this.emit({ type: 'connection:status', timestamp: Date.now(), payload: { connected: true } });
    };

    this.ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as CockpitEvent;
        this.emit(parsed);
      } catch {
        // Ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      this._connected = false;
      this.emit({ type: 'connection:status', timestamp: Date.now(), payload: { connected: false } });
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this._connected = false;
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.doConnect(), 3000);
  }

  on(type: EventType | '*', handler: EventHandler): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler);
    return () => {
      this.listeners.get(type)?.delete(handler);
    };
  }

  private emit(event: CockpitEvent): void {
    this.listeners.get(event.type)?.forEach((h) => h(event));
    this.listeners.get('*')?.forEach((h) => h(event));
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this._connected = false;
  }
}

export const eventBus = new EventBus();
