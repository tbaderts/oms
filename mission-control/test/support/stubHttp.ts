import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface RecordedRequest {
  method: string;
  url: string;
  body: string;
  receivedAt: number;
}

export type StubHandler = (req: RecordedRequest, res: ServerResponse) => void | Promise<void>;

export interface StubServer {
  url: string;
  requests: RecordedRequest[];
  close(): Promise<void>;
}

/** A local HTTP server that records every request and answers with the given handler. */
export async function stubHttp(handler: StubHandler): Promise<StubServer> {
  const requests: RecordedRequest[] = [];
  const server = createServer((req: IncomingMessage, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const rec: RecordedRequest = { method: req.method ?? '', url: req.url ?? '', body: Buffer.concat(chunks).toString('utf8'), receivedAt: Date.now() };
      requests.push(rec);
      Promise.resolve(handler(rec, res)).catch((e) => {
        res.statusCode = 500;
        res.end(String(e));
      });
    });
  });
  server.keepAliveTimeout = 30_000;
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections();
        server.close(() => r());
      }),
  };
}

export function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', status >= 400 ? 'application/problem+json' : 'application/json');
  res.end(JSON.stringify(body));
}
