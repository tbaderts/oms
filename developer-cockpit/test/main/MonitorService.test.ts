import { afterEach, describe, expect, it } from 'vitest';
import * as http from 'http';
import type { AddressInfo } from 'net';
import { MonitorService } from '../../src/main/services/MonitorService';

/** A stand-in for oms-core's actuator on an ephemeral port (same pattern as OmsHttpService.test.ts). */
async function fakeOmsCore(respond: (req: { url: string; method: string }, res: http.ServerResponse) => void) {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => respond({ url: req.url!, method: req.method! }, res));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, close: () => new Promise<void>((r) => server.close(() => r())) };
}

const json = (res: http.ServerResponse, status: number, body: unknown, type = 'application/json') => {
  res.writeHead(status, { 'Content-Type': type });
  res.end(JSON.stringify(body));
};

const text = (res: http.ServerResponse, status: number, body: string) => {
  res.writeHead(status, { 'Content-Type': 'text/plain' });
  res.end(body);
};

describe('MonitorService', () => {
  const cleanups: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const c of cleanups.splice(0)) await c();
  });

  const logs: string[] = [];
  const log = (line: string) => logs.push(line);
  const getBaseUrl = () => 'http://127.0.0.1:1'; // overridden per-test via a real server when needed

  it('AC-1: health() returns the UP status and the configured url from /actuator/health', async () => {
    const fake = await fakeOmsCore((req, res) => {
      if (req.url === '/actuator/health') json(res, 200, { status: 'UP', components: { db: { status: 'UP' } } });
      else json(res, 404, {});
    });
    cleanups.push(fake.close);
    const svc = new MonitorService(() => fake.base, { log });
    const r = await svc.health();
    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
    expect(r.body?.status).toBe('UP');
    expect(r.url).toBe(`${fake.base}/actuator/health`);
  });

  it('AC-9: prometheus() returns the raw text from /actuator/prometheus', async () => {
    const fake = await fakeOmsCore((req, res) => {
      if (req.url === '/actuator/prometheus') text(res, 200, 'oms-outbox-pending 4\noms-order-events-total{event="X"} 5');
      else json(res, 404, {});
    });
    cleanups.push(fake.close);
    const svc = new MonitorService(() => fake.base, { log });
    const r = await svc.prometheus();
    expect(r.ok).toBe(true);
    expect(r.raw).toContain('oms-outbox-pending 4');
    expect(r.raw).toContain('oms-order-events-total{event="X"} 5');
  });

  it('AC-9: a prometheus body over 5 MB is truncated and flagged truncated', async () => {
    const big = 'x'.repeat(6 * 1024 * 1024); // 6 MB > 5 MB limit
    const fake = await fakeOmsCore((req, res) => {
      if (req.url === '/actuator/prometheus') text(res, 200, big);
      else json(res, 404, {});
    });
    cleanups.push(fake.close);
    const svc = new MonitorService(() => fake.base, { log });
    const r = await svc.prometheus();
    expect(r.ok).toBe(true);
    expect(r.truncated).toBe(true);
    expect(r.raw).toHaveLength(5 * 1024 * 1024);
  });

  it('AC-6: an unreachable oms-core returns a not-reachable error, never throwing', async () => {
    // Point at a port with nothing listening (the default getBaseUrl above).
    const svc = new MonitorService(getBaseUrl, { log, timeoutMs: 1500 });
    const r = await svc.health();
    expect(r.ok).toBe(false);
    expect(r.status).toBeNull();
    expect(r.error).toContain('oms-core not reachable at');
    expect(r.error).toContain('http://127.0.0.1:1');
  });

  it('AC-6: a timeout produces a not-reachable error mentioning the timeout', async () => {
    const fake = await fakeOmsCore((_req, res) => {
      // Never respond; the client should time out.
      setTimeout(() => text(res, 200, 'late'), 5000);
    });
    cleanups.push(fake.close);
    const svc = new MonitorService(() => fake.base, { log, timeoutMs: 200 });
    const r = await svc.prometheus();
    expect(r.ok).toBe(false);
    expect(r.status).toBeNull();
    expect(r.error).toContain('timeout');
    // The error names the configured base URL (the host the user sees in Settings).
    expect(r.error).toContain(fake.base);
  });
});
