import { WebSocketServer as WSServer, WebSocket } from 'ws';
import type { CockpitEvent } from '../../shared/types/events';

export class WebSocketServer {
  private wss: WSServer | null = null;
  private clients = new Set<WebSocket>();

  constructor(private port: number) {}

  start(): void {
    this.wss = new WSServer({ port: this.port });

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

    console.log(`WebSocket server listening on port ${this.port}`);
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
