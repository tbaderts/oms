import type { AddressInfo } from 'net';
import { WebSocketServer as WSServer, WebSocket } from 'ws';
import type { CockpitEvent } from '../../shared/types/events';

/**
 * The only address the event server listens on, and the one the renderer is told to connect to.
 * IPv4 loopback: never reachable from the network, and no name resolution decides between
 * IPv4 and IPv6 (SPEC-0036).
 */
export const WS_HOST = '127.0.0.1';

export class WebSocketServer {
  private wss: WSServer | null = null;
  private clients = new Set<WebSocket>();

  constructor(private port: number) {}

  start(): void {
    this.wss = new WSServer({ host: WS_HOST, port: this.port });

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      ws.send(JSON.stringify({
        type: 'connection:status',
        timestamp: Date.now(),
        payload: { connected: true },
      }));

      ws.on('close', () => {
        this.clients.delete(ws);
      });

      ws.on('error', () => {
        this.clients.delete(ws);
      });
    });

    console.log(`WebSocket server listening on ${WS_HOST}:${this.port}`);
  }

  /** Where the server is bound, once it is listening. */
  address(): AddressInfo | null {
    const address = this.wss?.address();
    return address && typeof address === 'object' ? address : null;
  }

  broadcast(event: CockpitEvent): void {
    const message = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  stop(): void {
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();
    this.wss?.close();
    this.wss = null;
  }
}
