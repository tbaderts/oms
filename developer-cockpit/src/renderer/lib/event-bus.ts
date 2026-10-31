import type { CockpitEvent, EventType } from '@shared/types/events';

type EventHandler = (event: CockpitEvent) => void;

export class EventBus {
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
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.ws) this.release(this.ws);

    const socket = new WebSocket(this.url);
    this.ws = socket;

    // Only the current socket may change the status or reconnect. A replaced socket's late close
    // used to report Disconnected and reconnect, replacing the current one in a loop (SPEC-0036).
    socket.onopen = () => {
      if (this.ws !== socket) return;
      this._connected = true;
      this.emit({ type: 'connection:status', timestamp: Date.now(), payload: { connected: true } });
    };

    socket.onmessage = (event) => {
      if (this.ws !== socket) return;
      try {
        const parsed = JSON.parse(event.data) as CockpitEvent;
        this.emit(parsed);
      } catch {
        // Ignore malformed messages
      }
    };

    socket.onclose = () => {
      if (this.ws !== socket) return;
      this._connected = false;
      this.emit({ type: 'connection:status', timestamp: Date.now(), payload: { connected: false } });
      this.scheduleReconnect();
    };

    socket.onerror = () => {
      if (this.ws !== socket) return;
      this._connected = false;
    };
  }

  /** Closes a socket we no longer want, without letting its events reach the bus. */
  private release(socket: WebSocket): void {
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
    socket.close();
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
    this.reconnectTimer = null;
    if (this.ws) this.release(this.ws);
    this.ws = null;
    this._connected = false;
  }
}

export const eventBus = new EventBus();
