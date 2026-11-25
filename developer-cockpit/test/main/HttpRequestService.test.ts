import { afterEach, describe, expect, it } from 'vitest';
import * as http from 'http';
import type { AddressInfo } from 'net';
import { HttpRequestService } from '../../src/main/services/HttpRequestService';

interface Seen {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}

async function stub(respond: (req: Seen, res: http.ServerResponse) => void) {
  const seen: Seen[] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const s = { method: req.method!, url: req.url!, headers: req.headers, body };
      seen.push(s);
      respond(s, res);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, seen, close: () => new Promise<void>((r) => server.close(() => r())) };
}

describe('HttpRequestService', () => {
  const cleanups: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const c of cleanups.splice(0)) await c();
  });
  const logs: string[] = [];
  const svc = (timeoutMs?: number) => new HttpRequestService({ log: (l) => logs.push(l), ...(timeoutMs ? { timeoutMs } : {}) });

  it('sends method, headers and JSON body, and parses a JSON answer', async () => {
    const s = await stub((_req, res) => {
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end('{"id":"B-1"}');
    });
    cleanups.push(s.close);
    const r = await svc().send({ method: 'post', url: `${s.base}/v1/baskets?x=1`, headers: { 'X-Trace': 'abc', Host: 'evil' }, body: '{"sku":"A"}' });

    expect(r).toMatchObject({ ok: true, status: 201, body: { id: 'B-1' }, url: `${s.base}/v1/baskets?x=1` });
    expect(s.seen[0]).toMatchObject({ method: 'POST', url: '/v1/baskets?x=1', body: '{"sku":"A"}' });
    expect(s.seen[0].headers['x-trace']).toBe('abc');
    expect(s.seen[0].headers['content-type']).toBe('application/json');
    expect(s.seen[0].headers.host).toBe(new URL(s.base).host); // the Host header cannot be overridden
    expect(logs.at(-1)).toMatch(/^\[api-explorer\] POST 127\.0\.0\.1:\d+\/v1\/baskets 201 \d+ms$/);
  });

  it('a GET sends no body; an error status is not ok; text stays text', async () => {
    const s = await stub((_req, res) => {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('nope');
    });
    cleanups.push(s.close);
    const r = await svc().send({ method: 'GET', url: `${s.base}/x`, body: 'ignored' });
    expect(r).toMatchObject({ ok: false, status: 404, body: 'nope' });
    expect(s.seen[0].body).toBe('');
  });

  it('refuses bad input before sending', async () => {
    expect(await svc().send({ method: 'GET', url: 'file:///etc/passwd' })).toMatchObject({ refused: true, error: 'Invalid URL: file:///etc/passwd' });
    expect(await svc().send({ method: 'BREW', url: 'http://localhost:1/' })).toMatchObject({ refused: true, error: 'Unsupported method BREW' });
    expect(await svc().send({ method: 'GET', url: 'http://localhost:1/baskets/{basketId}' })).toMatchObject({
      refused: true,
      error: 'Fill in the path parameters: /baskets/{basketId}',
    });
  });

  it('a changing request to a non-local host needs that host confirmed', async () => {
    const r = await svc().send({ method: 'DELETE', url: 'http://shop.example.test/baskets/1' });
    expect(r).toMatchObject({ refused: true, status: null, error: 'Sending DELETE to shop.example.test needs confirmation' });
  });

  it('unreachable and timeout are results, not exceptions', async () => {
    const hang = await stub(() => {
      /* never answers */
    });
    cleanups.push(hang.close);
    const t = await svc(200).send({ method: 'GET', url: `${hang.base}/slow` });
    expect(t).toMatchObject({ ok: false, status: null, error: `Not reachable: ${hang.base}: timeout after 200 ms` });
    expect(t.refused).toBeUndefined();
  });
});

describe('HttpRequestService redirects (SPEC-0076 review)', () => {
  it('returns a redirect instead of following it, so it cannot reach an unconfirmed host', async () => {
    const http = await import('http');
    let hits = 0;
    const server = http.createServer((req, res) => {
      hits++;
      res.writeHead(307, { Location: 'https://elsewhere.example.test/steal' });
      res.end();
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    try {
      const port = (server.address() as import('net').AddressInfo).port;
      const r = await new HttpRequestService({ log: () => {} }).send({ method: 'POST', url: `http://127.0.0.1:${port}/x`, body: '{"a":1}' });
      expect(r.status).toBe(307);
      expect(hits).toBe(1);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
