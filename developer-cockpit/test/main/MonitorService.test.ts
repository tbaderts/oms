import { afterEach, describe, expect, it } from 'vitest';
import * as http from 'http';
import * as net from 'net';
import type { AddressInfo } from 'net';
import { MonitorService } from '../../src/main/services/MonitorService';
import { projectConfigSchema, type MonitoringConfig } from '../../src/shared/projectConfig';

type Handler = (req: { url: string }, res: http.ServerResponse) => void;

/** A stand-in for a monitored service or a Prometheus API on an ephemeral port. */
async function stub(respond: Handler) {
  const server = http.createServer((req, res) => respond({ url: req.url! }, res));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, close: () => new Promise<void>((r) => server.close(() => r())) };
}

const json = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};
const text = (res: http.ServerResponse, status: number, body: string) => {
  res.writeHead(status, { 'Content-Type': 'text/plain' });
  res.end(body);
};

/** A port nothing listens on (bound, then released). */
async function closedPort(): Promise<number> {
  const s = net.createServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  const port = (s.address() as AddressInfo).port;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}

const monitoring = (m: unknown): MonitoringConfig => projectConfigSchema.parse({ monitoring: m }).monitoring;

describe('MonitorService', () => {
  const cleanups: (() => Promise<void> | void)[] = [];
  afterEach(async () => {
    for (const c of cleanups.splice(0)) await c();
  });
  const logs: string[] = [];
  const svc = () => new MonitorService({ log: (l) => logs.push(l) });

  describe('service checks', () => {
    it('httpCheck_upBelow400_downOtherwise', async () => {
      const s = await stub((req, res) => (req.url === '/ok' ? text(res, 204, '') : text(res, 503, 'busy')));
      cleanups.push(s.close);
      const m = monitoring({
        services: [
          { name: 'web', check: { kind: 'http', url: `${s.base}/ok` } },
          { name: 'busy', check: { kind: 'http', url: `${s.base}/busy` } },
        ],
      });
      const [ok, busy] = await Promise.all(m.services.map((x) => svc().checkService(x)));
      expect(ok).toMatchObject({ name: 'web', status: 'UP', target: `${s.base}/ok` });
      expect(ok.latencyMs).toBeGreaterThanOrEqual(0);
      expect(busy).toMatchObject({ status: 'DOWN', reason: 'HTTP 503' });
    });

    it('actuatorCheck_mapsStatusAndComponents', async () => {
      const bodies: Record<string, [number, unknown]> = {
        '/up': [200, { status: 'UP', components: { db: { status: 'UP' }, diskSpace: { status: 'UP' } } }],
        '/down': [503, { status: 'DOWN', components: { db: { status: 'DOWN' }, diskSpace: { status: 'UP' } } }],
        '/oos': [503, { status: 'OUT_OF_SERVICE' }],
        '/odd': [200, { status: 'DEGRADED' }],
        '/html': [200, '<html>'],
      };
      const s = await stub((req, res) => json(res, bodies[req.url][0], bodies[req.url][1]));
      cleanups.push(s.close);
      const check = (path: string) => svc().checkService(monitoring({ services: [{ name: path, check: { kind: 'spring-actuator', url: s.base + path } }] }).services[0]);

      expect(await check('/up')).toMatchObject({ status: 'UP', components: { db: 'UP', diskSpace: 'UP' } });
      expect(await check('/down')).toMatchObject({ status: 'DOWN', reason: 'DOWN (db)', components: { db: 'DOWN' } });
      expect(await check('/oos')).toMatchObject({ status: 'DOWN', reason: 'OUT_OF_SERVICE' });
      expect(await check('/odd')).toMatchObject({ status: 'UNKNOWN', reason: 'status DEGRADED' });
      expect(await check('/html')).toMatchObject({ status: 'UNKNOWN' });
    });

    it('tcpCheck_upWhenPortAccepts', async () => {
      const server = net.createServer((sock) => sock.end());
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
      cleanups.push(() => new Promise<void>((r) => server.close(() => r())));
      const port = (server.address() as AddressInfo).port;
      const closed = await closedPort();
      const m = monitoring({
        services: [
          { name: 'db', check: { kind: 'tcp', host: '127.0.0.1', port } },
          { name: 'gone', check: { kind: 'tcp', host: '127.0.0.1', port: closed } },
        ],
      });
      expect(await svc().checkService(m.services[0])).toMatchObject({ status: 'UP', target: `127.0.0.1:${port}` });
      expect(await svc().checkService(m.services[1])).toMatchObject({ status: 'DOWN', reason: 'not reachable: ECONNREFUSED' });
    });

    it('unreachableOrTimeout_isDownWithReasonAndTarget', async () => {
      const port = await closedPort();
      const hang = await stub(() => {
        /* never answers */
      });
      cleanups.push(hang.close);
      const m = monitoring({
        services: [
          { name: 'gone', check: { kind: 'http', url: `http://127.0.0.1:${port}/health` } },
          { name: 'slow', check: { kind: 'spring-actuator', url: `${hang.base}/actuator/health`, timeoutMs: 200 } },
        ],
      });
      const gone = await svc().checkService(m.services[0]);
      expect(gone).toMatchObject({ status: 'DOWN', target: `http://127.0.0.1:${port}/health` });
      expect(gone.reason).toMatch(/^not reachable: /);
      expect(await svc().checkService(m.services[1])).toMatchObject({ status: 'DOWN', reason: 'timeout after 200 ms', target: `${hang.base}/actuator/health` });
    });

    it('oneFailingService_othersStillChecked', async () => {
      const s = await stub((_req, res) => json(res, 200, { status: 'UP' }));
      cleanups.push(s.close);
      const port = await closedPort();
      const poll = await svc().poll(
        monitoring({
          services: [
            { name: 'a', check: { kind: 'spring-actuator', url: `${s.base}/a` } },
            { name: 'b', check: { kind: 'http', url: `http://127.0.0.1:${port}/` } },
            { name: 'c', check: { kind: 'http', url: `${s.base}/c` } },
          ],
        }),
      );
      expect(poll.checks.map((c) => [c.name, c.status])).toEqual([
        ['a', 'UP'],
        ['b', 'DOWN'],
        ['c', 'UP'],
      ]);
      expect(logs.at(-1)).toMatch(/^\[monitor\] poll services=3 up=2 panels=0 failed=0 \d+ms$/);
    });
  });

  describe('panels', () => {
    it('promqlStatBarsAndRange_fromStubbedApi', async () => {
      const seen: string[] = [];
      const prom = await stub((req, res) => {
        seen.push(req.url);
        const u = new URL(req.url, 'http://x');
        const q = u.searchParams.get('query');
        if (u.pathname === '/prometheus/api/v1/query' && q === 'sum(up)') {
          json(res, 200, { status: 'success', data: { resultType: 'vector', result: [{ metric: {}, value: [1, '7'] }] } });
        } else if (u.pathname === '/prometheus/api/v1/query' && q === 'sum by (state) (jobs)') {
          json(res, 200, {
            status: 'success',
            data: { resultType: 'vector', result: [{ metric: { state: 'queued' }, value: [1, '4'] }, { metric: { state: 'running' }, value: [1, '2'] }] },
          });
        } else if (u.pathname === '/prometheus/api/v1/query_range') {
          json(res, 200, { status: 'success', data: { resultType: 'matrix', result: [{ metric: {}, values: [[100, '1'], [130, '3']] }] } });
        } else {
          json(res, 400, { status: 'error', errorType: 'bad_data', error: 'parse error' });
        }
      });
      cleanups.push(prom.close);
      const m = monitoring({
        prometheusUrl: `${prom.base}/prometheus`,
        panels: [
          { title: 'Up', type: 'stat', source: { kind: 'promql', query: 'sum(up)' } },
          { title: 'Jobs', type: 'bars', by: 'state', source: { kind: 'promql', query: 'sum by (state) (jobs)' } },
          { title: 'Rate', type: 'timeseries', unit: 'perMinute', source: { kind: 'promql', query: 'rate(x[1m])' } },
          { title: 'Broken', type: 'stat', source: { kind: 'promql', query: 'sum(' } },
        ],
      });
      const { panels } = await svc().poll(m);
      expect(panels[0]).toMatchObject({ title: 'Up', ok: true, value: 7, unit: 'count' });
      expect(panels[1]).toMatchObject({ ok: true, bars: [{ label: 'queued', value: 4 }, { label: 'running', value: 2 }] });
      expect(panels[2]).toMatchObject({ ok: true, unit: 'perMinute', series: [{ t: 100_000, value: 1 }, { t: 130_000, value: 3 }] });
      expect(panels[3]).toMatchObject({ ok: false, error: 'Query failed: parse error' });
      const range = new URL(seen.find((u) => u.includes('query_range'))!, 'http://x').searchParams;
      expect(Number(range.get('end')) - Number(range.get('start'))).toBe(15 * 60);
      expect(range.get('step')).toBe('30');
    });

    it('scrapePanels_sumGroupQuantile', async () => {
      let scrapes = 0;
      const app = await stub((req, res) => {
        if (req.url === '/metrics') {
          scrapes++;
          text(res, 200, 'jobs{state="queued"} 4\njobs{state="running"} 2\nlat_bucket{le="1"} 50\nlat_bucket{le="2"} 100\nlat_bucket{le="+Inf"} 100\n');
        } else json(res, 200, { status: 'UP' });
      });
      cleanups.push(app.close);
      const m = monitoring({
        services: [{ name: 'app', check: { kind: 'http', url: `${app.base}/health` }, metricsUrl: `${app.base}/metrics` }],
        panels: [
          { title: 'Jobs', type: 'stat', source: { kind: 'scrape', service: 'app', metric: 'jobs' } },
          { title: 'Queued', type: 'stat', source: { kind: 'scrape', service: 'app', metric: 'jobs', labels: { state: 'queued' } } },
          { title: 'By state', type: 'bars', source: { kind: 'scrape', service: 'app', metric: 'jobs', by: 'state' } },
          { title: 'p50', type: 'stat', unit: 's', source: { kind: 'scrape', service: 'app', metric: 'lat', quantile: 0.5 } },
          { title: 'Missing', type: 'stat', source: { kind: 'scrape', service: 'app', metric: 'nope' } },
        ],
      });
      const { panels } = await svc().poll(m);
      expect(panels.map((p) => (p.bars ? p.bars : p.value))).toEqual([6, 4, [{ label: 'queued', value: 4 }, { label: 'running', value: 2 }], 1, null]);
      expect(panels.every((p) => p.ok)).toBe(true);
      expect(scrapes).toBe(1); // one scrape per service per poll
    });

    it('failingPanelSource_errorOnlyOnThatPanel', async () => {
      const port = await closedPort();
      const app = await stub((_req, res) => text(res, 200, 'jobs 3\n'));
      cleanups.push(app.close);
      const m = monitoring({
        prometheusUrl: `http://127.0.0.1:${port}`,
        services: [
          { name: 'app', check: { kind: 'http', url: `${app.base}/` }, metricsUrl: `${app.base}/metrics` },
          { name: 'dead', check: { kind: 'http', url: `http://127.0.0.1:${port}/` }, metricsUrl: `http://127.0.0.1:${port}/metrics` },
        ],
        panels: [
          { title: 'Good', type: 'stat', source: { kind: 'scrape', service: 'app', metric: 'jobs' } },
          { title: 'Dead scrape', type: 'stat', source: { kind: 'scrape', service: 'dead', metric: 'jobs' } },
          { title: 'Dead prometheus', type: 'stat', source: { kind: 'promql', query: 'up' } },
        ],
      });
      const { panels } = await svc().poll(m);
      expect(panels[0]).toMatchObject({ ok: true, value: 3 });
      expect(panels[1].ok).toBe(false);
      expect(panels[1].error).toMatch(new RegExp(`^http://127.0.0.1:${port}/metrics: not reachable`));
      expect(panels[2].ok).toBe(false);
      expect(panels[2].error).toMatch(new RegExp(`^http://127.0.0.1:${port}: not reachable`));
      expect(logs.at(-1)).toMatch(/panels=3 failed=2/);
    });

    it('a promql panel without prometheusUrl fails on its own', async () => {
      const m = { intervalSeconds: 10, services: [], panels: [{ title: 'X', type: 'stat' as const, unit: 'count' as const, source: { kind: 'promql' as const, query: 'up' } }] };
      const r = await svc().queryPanel(m.panels[0], m);
      expect(r).toMatchObject({ ok: false, error: 'No monitoring.prometheusUrl configured' });
    });
  });
});
