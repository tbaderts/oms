import { afterEach, describe, expect, it } from 'vitest';
import * as http from 'http';
import type { AddressInfo } from 'net';
import { OmsHttpService, REQUEST_TIMEOUT_MS } from '../../src/main/services/OmsHttpService';

interface Received {
  method: string;
  url: string;
  contentType: string;
  body: string;
}

/** A stand-in for oms-core on an ephemeral port. */
async function fakeOmsCore(respond: (req: Received, res: http.ServerResponse) => void) {
  const received: Received[] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const r = { method: req.method!, url: req.url!, contentType: String(req.headers['content-type'] ?? ''), body };
      received.push(r);
      respond(r, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, received, close: () => new Promise<void>((r) => server.close(() => r())), server };
}

const json = (res: http.ServerResponse, status: number, body: unknown, type = 'application/json') => {
  res.writeHead(status, { 'Content-Type': type });
  res.end(JSON.stringify(body));
};

/** A fetch that answers from a table of path → [status, body] and records the URLs it was asked for. */
function fakeFetch(routes: Record<string, [number, unknown]>) {
  const urls: string[] = [];
  const impl = (async (input: string | URL) => {
    const url = String(input);
    urls.push(url);
    const { pathname, search } = new URL(url);
    const hit = routes[pathname + search] ?? routes[pathname];
    if (!hit) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(hit[1]), { status: hit[0], headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return { impl, urls };
}

describe('OmsHttpService', () => {
  const cleanups: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const c of cleanups.splice(0)) await c();
  });
  const logs: string[] = [];
  const log = (line: string) => logs.push(line);

  it('posts the command to /api/command/execute and returns status, duration and body', async () => {
    const oms = await fakeOmsCore((req, res) =>
      JSON.parse(req.body).order?.clOrdId === 'bad'
        ? json(res, 400, { id: '', status: 'FAILED', message: 'Order creation failed: x' })
        : json(res, 201, { id: 'O-1', status: 'OK', message: 'Order created successfully: O-1' }),
    );
    cleanups.push(oms.close);
    const service = new OmsHttpService(() => oms.base, { log });

    const created = await service.sendCommand('{"type":"OrderCreateCmd","order":{"clOrdId":"c1"}}');
    expect(oms.received[0]).toMatchObject({ method: 'POST', url: '/api/command/execute', contentType: 'application/json' });
    expect(JSON.parse(oms.received[0].body)).toEqual({ type: 'OrderCreateCmd', order: { clOrdId: 'c1' } });
    expect(created).toMatchObject({ ok: true, status: 201, body: { id: 'O-1', status: 'OK' }, url: `${oms.base}/api/command/execute` });
    expect(created.durationMs).toBeGreaterThanOrEqual(0);
    expect(created.error).toBeUndefined();

    const failed = await service.sendCommand('{"type":"OrderCreateCmd","order":{"clOrdId":"bad"}}');
    expect(failed).toMatchObject({ ok: false, status: 400, body: { status: 'FAILED' } });
    expect(logs.some((l) => /^\[api-explorer\] POST \/api\/command\/execute 201 \d+ms$/.test(l))).toBe(true);
  });

  it('keeps a non-JSON body as text', async () => {
    const oms = await fakeOmsCore((_req, res) => {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('boom');
    });
    cleanups.push(oms.close);
    const r = await new OmsHttpService(() => oms.base, { log }).sendCommand('{"type":"OrderAcceptCmd","orderId":"X"}');
    expect(r).toMatchObject({ ok: false, status: 500, body: 'boom', contentType: 'text/plain' });
  });

  it('refuses a body that is not JSON without sending', async () => {
    const f = fakeFetch({});
    const r = await new OmsHttpService(() => 'http://localhost:8090', { fetch: f.impl, log }).sendCommand('{"type":');
    expect(r).toMatchObject({ ok: false, status: null });
    expect(r.error).toMatch(/not valid JSON/);
    expect(f.urls).toEqual([]);
  });

  it('reports oms-core not reachable on connection refused', async () => {
    const oms = await fakeOmsCore(() => {});
    await oms.close(); // the port is now closed
    const r = await new OmsHttpService(() => oms.base, { log }).sendCommand('{"type":"OrderAcceptCmd","orderId":"X"}');
    expect(r).toMatchObject({ ok: false, status: null });
    expect(r.error).toContain(`oms-core not reachable at ${oms.base}`);
    expect(r.error).toMatch(/ECONNREFUSED|fetch failed/);
  });

  it('times out after the request timeout', async () => {
    expect(REQUEST_TIMEOUT_MS).toBe(10_000);
    const oms = await fakeOmsCore(() => {}); // never answers
    cleanups.push(async () => {
      oms.server.closeAllConnections();
      await oms.close();
    });
    const r = await new OmsHttpService(() => oms.base, { log, timeoutMs: 200 }).sendCommand('{"type":"OrderAcceptCmd","orderId":"X"}');
    expect(r).toMatchObject({ ok: false, status: null });
    expect(r.error).toContain(`oms-core not reachable at ${oms.base}: timeout after 200 ms`);
  });

  it('never throws across IPC', async () => {
    const throwing = (async () => {
      throw new TypeError('kaboom');
    }) as typeof fetch;
    const service = new OmsHttpService(() => 'http://localhost:8090', { fetch: throwing, log });
    await expect(service.sendCommand('{}')).resolves.toMatchObject({ ok: false, status: null });
    await expect(service.search([], {})).resolves.toMatchObject({ ok: false, status: null });
    await expect(service.followUp('X')).resolves.toMatchObject({ order: null, events: null });
    const bad = new OmsHttpService(() => 'ftp://nowhere', { fetch: throwing, log });
    await expect(bad.sendCommand('{}')).resolves.toMatchObject({ ok: false, error: 'Invalid oms-core URL: ftp://nowhere' });
  });

  it('refuses a command to a non-local host without matching confirmation; queries need none', async () => {
    const f = fakeFetch({ '/api/command/execute': [200, { status: 'OK' }], '/api/query/search': [200, { content: [] }] });
    const service = new OmsHttpService(() => 'https://oms-test.example', { fetch: f.impl, log });
    const refused = await service.sendCommand('{"type":"OrderAcceptCmd","orderId":"X"}');
    expect(refused).toMatchObject({ ok: false, status: null, error: 'Sending a command to oms-test.example needs confirmation' });
    expect(await service.sendCommand('{"type":"OrderAcceptCmd","orderId":"X"}', 'other.example')).toMatchObject({ status: null });
    expect(f.urls).toEqual([]);

    expect(await service.sendCommand('{"type":"OrderAcceptCmd","orderId":"X"}', 'oms-test.example')).toMatchObject({ status: 200 });
    expect(await service.search([], {})).toMatchObject({ status: 200 });
    expect(f.urls).toEqual(['https://oms-test.example/api/command/execute', 'https://oms-test.example/api/query/search']);
  });

  it('search builds the query string and refuses unknown filter fields', async () => {
    const f = fakeFetch({ '/api/query/search': [200, { content: [{ orderId: 'O-1' }], page: { totalElements: 1 } }] });
    const service = new OmsHttpService(() => 'http://localhost:8090/', { fetch: f.impl, log });
    const r = await service.search([{ field: 'symbol', op: 'eq', value: 'AAPL' }], { page: 0, size: 20 });
    expect(r).toMatchObject({ ok: true, status: 200, url: 'http://localhost:8090/api/query/search?symbol=AAPL&page=0&size=20' });
    expect(f.urls).toEqual(['http://localhost:8090/api/query/search?symbol=AAPL&page=0&size=20']);

    const bad = await service.search([{ field: 'symbl', op: 'eq', value: 'AAPL' }], {});
    expect(bad).toMatchObject({ ok: false, status: null, error: 'Unknown filter field: symbl' });
    expect(f.urls).toHaveLength(1);
  });

  it('followUp loads the order and events sorted by version', async () => {
    const ev = (version: number, event: string, state: string) => ({
      id: version,
      orderId: 'O 1',
      version,
      event,
      transaction: { type: 'X' },
      resultingState: state,
      orderSnapshot: { orderId: 'O 1' },
      timeStamp: '2026-10-27T10:00:00Z',
    });
    const f = fakeFetch({
      '/api/query/search?orderId=O+1&size=1': [200, { content: [{ orderId: 'O 1', state: 'LIVE' }] }],
      '/api/order-events/orderId/O%201': [200, [ev(2, 'ACCEPT', 'LIVE'), ev(1, 'NEW_ORDER', 'UNACK')]],
    });
    const r = await new OmsHttpService(() => 'http://localhost:8090', { fetch: f.impl, log }).followUp('O 1');
    expect(f.urls).toEqual([
      'http://localhost:8090/api/query/search?orderId=O+1&size=1',
      'http://localhost:8090/api/order-events/orderId/O%201',
    ]);
    expect(r.order).toEqual({ orderId: 'O 1', state: 'LIVE' });
    expect(r.events!.map((e) => [e.version, e.event, e.resultingState])).toEqual([
      [1, 'NEW_ORDER', 'UNACK'],
      [2, 'ACCEPT', 'LIVE'],
    ]);
    expect(r.events![0]).toMatchObject({ timeStamp: '2026-10-27T10:00:00Z', transaction: { type: 'X' }, orderSnapshot: { orderId: 'O 1' } });
    expect(r.error).toBeUndefined();
  });

  it('unknown order gives order null and no timeline', async () => {
    const f = fakeFetch({ '/api/query/search': [200, { content: [] }], '/api/order-events/orderId/NOPE': [200, []] });
    const r = await new OmsHttpService(() => 'http://localhost:8090', { fetch: f.impl, log }).followUp('NOPE');
    expect(r).toEqual({ orderId: 'NOPE', order: null, events: [] });
  });

  it('unexpected event shape falls back to raw', async () => {
    const raw = { events: 'something else' };
    const f = fakeFetch({ '/api/query/search': [200, { content: [{ orderId: 'O' }] }], '/api/order-events/orderId/O': [200, raw] });
    const r = await new OmsHttpService(() => 'http://localhost:8090', { fetch: f.impl, log }).followUp('O');
    expect(r).toMatchObject({ order: { orderId: 'O' }, events: null, rawEvents: raw });
  });

  it('marks requests refused before sending', async () => {
    const f = fakeFetch({});
    const service = new OmsHttpService(() => 'https://oms-test.example', { fetch: f.impl, log });
    expect(await service.sendCommand('{"type":')).toMatchObject({ status: null, refused: true });
    expect(await service.sendCommand('{"type":"OrderAcceptCmd","orderId":"X"}')).toMatchObject({ status: null, refused: true });
    expect(await service.search([{ field: 'symbl', op: 'eq', value: 'X' }], {})).toMatchObject({ status: null, refused: true });
    expect(f.urls).toEqual([]);
  });

  it('refuses a blank order id without a request', async () => {
    const f = fakeFetch({});
    const service = new OmsHttpService(() => 'http://localhost:8090', { fetch: f.impl, log });
    expect(await service.followUp('  ')).toEqual({ orderId: '  ', order: null, events: null, error: 'No order id' });
    expect(f.urls).toEqual([]);
  });

  it('keeps the order when the events call fails', async () => {
    const f = fakeFetch({ '/api/query/search': [200, { content: [{ orderId: 'O' }] }], '/api/order-events/orderId/O': [500, { error: 'x' }] });
    const r = await new OmsHttpService(() => 'http://localhost:8090', { fetch: f.impl, log }).followUp('O');
    expect(r.order).toEqual({ orderId: 'O' });
    expect(r.events).toBeNull();
    expect(r.error).toMatch(/events: HTTP 500/);
    expect(r.orderError).toBeUndefined();
  });

  it('tells a failed order query from an unknown order', async () => {
    const f = fakeFetch({ '/api/query/search': [500, { error: 'x' }], '/api/order-events/orderId/O': [200, []] });
    const r = await new OmsHttpService(() => 'http://localhost:8090', { fetch: f.impl, log }).followUp('O');
    expect(r).toMatchObject({ order: null, orderError: 'HTTP 500', events: [] });
  });
});
