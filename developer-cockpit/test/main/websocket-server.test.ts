import { afterEach, describe, expect, it } from 'vitest';
import * as net from 'net';
import WebSocket from 'ws';
import type { IpcMain } from 'electron';
import { WebSocketServer } from '../../src/main/websocket/server';
import { registerEventsIpc } from '../../src/main/ipc/events.ipc';

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

/** The first message a client gets, or the connect error. */
function greeting(url: string): Promise<{ message?: unknown; error?: Error }> {
  return new Promise((resolve) => {
    const client = new WebSocket(url);
    client.once('message', (data) => {
      resolve({ message: JSON.parse(String(data)) });
      client.close();
    });
    client.once('error', (error) => resolve({ error }));
  });
}

describe('WebSocket server address (SPEC-0036)', () => {
  let server: WebSocketServer | null = null;
  afterEach(() => {
    server?.stop();
    server = null;
  });

  async function started(): Promise<number> {
    const port = await freePort();
    server = new WebSocketServer(port);
    server.start();
    // Wait for the bind itself, not a fixed delay: address() is null until the server listens.
    for (let i = 0; i < 100 && !server.address(); i++) await new Promise((r) => setTimeout(r, 20));
    return port;
  }

  it('binds IPv4 loopback only', async () => {
    const port = await started();
    expect(server!.address()).toMatchObject({ address: '127.0.0.1', port });
    const v6 = await greeting(`ws://[::1]:${port}`);
    expect(v6.error).toBeDefined();
  });

  it('greets a client on 127.0.0.1', async () => {
    const port = await started();
    const v4 = await greeting(`ws://127.0.0.1:${port}`);
    expect(v4.message).toMatchObject({ type: 'connection:status', payload: { connected: true } });
  });

  it('getWebSocketUrl returns the loopback URL', async () => {
    const handlers = new Map<string, () => Promise<unknown>>();
    const ipcMain = { handle: (channel: string, fn: () => Promise<unknown>) => handlers.set(channel, fn) } as unknown as IpcMain;
    registerEventsIpc(ipcMain, 9321);
    await expect(handlers.get('events:getWebSocketUrl')!()).resolves.toBe('ws://127.0.0.1:9321');
  });
});
