import * as net from 'net';
import type { MonitoredService, MonitoringConfig, PanelConfig } from '../../shared/projectConfig';
import type { MonitorPoll, PanelResult, ServiceCheck, ServiceStatus } from '../../shared/types/monitor';
import { groupBy, histogramQuantile, parsePrometheusText, sumMatching, type Sample } from '../../shared/prometheusParser';

/** Response cap for health bodies, scrapes and Prometheus answers. */
const MAX_BODY_CHARS = 5 * 1024 * 1024;
/** Timeout for scrapes and Prometheus API calls (health checks use their own `timeoutMs`). */
export const QUERY_TIMEOUT_MS = 5_000;
/** The window and step of a timeseries panel's range query. */
export const RANGE_MINUTES = 15;
export const RANGE_STEP_SECONDS = 30;

export interface MonitorServiceOptions {
  fetch?: typeof fetch;
  queryTimeoutMs?: number;
  log?: (line: string) => void;
  now?: () => number;
}

/**
 * Checks the services and evaluates the panels a project configures in `cockpit.yaml`
 * (SPEC-0076). Runs in the main process, so there is no CSP or CORS between it and the services.
 * It never throws: every failure becomes a DOWN check or a panel with `ok: false` and an error.
 *
 * Health checks:
 * - `http`: GET; a status below 400 is UP.
 * - `spring-actuator`: GET the health endpoint; the body's `status` UP is UP, DOWN and
 *   OUT_OF_SERVICE are DOWN, anything else is UNKNOWN. Components are reported.
 * - `tcp`: UP when the port accepts a connection.
 *
 * Panels read a Prometheus-compatible HTTP API (`promql`) or a service's Prometheus text endpoint
 * (`scrape`, fetched once per poll however many panels use it).
 */
export class MonitorService {
  private fetchImpl: typeof fetch;
  private queryTimeoutMs: number;
  private log: (line: string) => void;
  private now: () => number;

  constructor(opts: MonitorServiceOptions = {}) {
    this.fetchImpl = opts.fetch ?? fetch;
    this.queryTimeoutMs = opts.queryTimeoutMs ?? QUERY_TIMEOUT_MS;
    this.log = opts.log ?? ((line) => console.info(line));
    this.now = opts.now ?? Date.now;
  }

  /** All checks and panels in parallel; one log line per poll. */
  async poll(monitoring: MonitoringConfig): Promise<MonitorPoll> {
    const started = performance.now();
    const scrapes = new Map<string, Promise<Sample[] | string>>();
    const [checks, panels] = await Promise.all([
      Promise.all(monitoring.services.map((s) => this.checkService(s))),
      Promise.all(monitoring.panels.map((p) => this.queryPanel(p, monitoring, scrapes))),
    ]);
    const up = checks.filter((c) => c.status === 'UP').length;
    const failed = panels.filter((p) => !p.ok).length;
    this.log(
      `[monitor] poll services=${checks.length} up=${up} panels=${panels.length} failed=${failed} ${Math.round(performance.now() - started)}ms`,
    );
    return { checks, panels, at: this.now() };
  }

  async checkService(service: MonitoredService): Promise<ServiceCheck> {
    const check = service.check;
    const target = check.kind === 'tcp' ? `${check.host}:${check.port}` : check.url;
    const started = performance.now();
    const done = (status: ServiceStatus, extra: Partial<ServiceCheck> = {}): ServiceCheck => ({
      name: service.name,
      status,
      latencyMs: Math.round(performance.now() - started),
      checkedAt: this.now(),
      target,
      ...extra,
    });

    if (check.kind === 'tcp') {
      const error = await tcpConnect(check.host, check.port, check.timeoutMs);
      return error ? done('DOWN', { reason: error }) : done('UP');
    }

    const r = await this.get(check.url, check.timeoutMs, check.kind === 'spring-actuator' ? 'application/json' : '*/*');
    if (r.error !== undefined) return done('DOWN', { reason: r.error });
    if (check.kind === 'http') {
      return r.status < 400 ? done('UP') : done('DOWN', { reason: `HTTP ${r.status}` });
    }
    return done(...actuatorStatus(r.status, r.body));
  }

  async queryPanel(panel: PanelConfig, monitoring: MonitoringConfig, scrapes = new Map<string, Promise<Sample[] | string>>()): Promise<PanelResult> {
    const base: PanelResult = { title: panel.title, type: panel.type, unit: panel.unit, ok: false };
    const fail = (error: string): PanelResult => ({ ...base, error });
    const source = panel.source;

    if (source.kind === 'scrape') {
      const service = monitoring.services.find((s) => s.name === source.service);
      if (!service?.metricsUrl) return fail(`No metrics endpoint for service "${source.service}"`);
      const url = service.metricsUrl;
      if (!scrapes.has(url)) {
        scrapes.set(
          url,
          this.get(url, this.queryTimeoutMs, 'text/plain').then((r) =>
            r.error !== undefined ? `${url}: ${r.error}` : r.status >= 400 ? `${url}: HTTP ${r.status}` : parsePrometheusText(r.body),
          ),
        );
      }
      const samples = await scrapes.get(url)!;
      if (typeof samples === 'string') return fail(samples);
      if (panel.type === 'bars') {
        return { ...base, ok: true, bars: groupBy(samples, source.metric, source.by ?? panel.by ?? '', source.labels) };
      }
      const value =
        source.quantile !== undefined
          ? histogramQuantile(samples, source.metric, source.quantile, source.labels)
          : sumMatching(samples, source.metric, source.labels);
      return { ...base, ok: true, value };
    }

    if (!monitoring.prometheusUrl) return fail('No monitoring.prometheusUrl configured');
    const api = `${monitoring.prometheusUrl.replace(/\/+$/, '')}/api/v1`;
    let url: string;
    if (panel.type === 'timeseries') {
      const end = Math.floor(this.now() / 1000);
      const start = end - RANGE_MINUTES * 60;
      url = `${api}/query_range?${new URLSearchParams({ query: source.query, start: String(start), end: String(end), step: String(RANGE_STEP_SECONDS) })}`;
    } else {
      url = `${api}/query?${new URLSearchParams({ query: source.query })}`;
    }
    const r = await this.get(url, this.queryTimeoutMs, 'application/json');
    if (r.error !== undefined) return fail(`${monitoring.prometheusUrl}: ${r.error}`);
    let body: PromResponse;
    try {
      body = JSON.parse(r.body ?? '') as PromResponse;
    } catch {
      return fail(`${monitoring.prometheusUrl}: HTTP ${r.status}, not a Prometheus API answer`);
    }
    if (body.status !== 'success' || !body.data) return fail(`Query failed: ${body.error ?? `HTTP ${r.status}`}`);
    const result = Array.isArray(body.data.result) ? body.data.result : [];

    if (panel.type === 'timeseries') {
      const values = result[0]?.values ?? [];
      return { ...base, ok: true, series: values.map(([t, v]) => ({ t: Number(t) * 1000, value: Number(v) })).filter((p) => Number.isFinite(p.value)) };
    }
    if (panel.type === 'bars') {
      const by = panel.by ?? '';
      return {
        ...base,
        ok: true,
        bars: result.map((s) => ({ label: s.metric?.[by] ?? (Object.values(s.metric ?? {}).join(',') || '(none)'), value: Number(s.value?.[1]) })).filter((b) => Number.isFinite(b.value)),
      };
    }
    const values = result.map((s) => Number(s.value?.[1])).filter((v) => Number.isFinite(v));
    return { ...base, ok: true, value: values.length ? values.reduce((a, b) => a + b, 0) : null };
  }

  /** One GET; never throws. `error` is set when no HTTP answer arrived. */
  private async get(url: string, timeoutMs: number, accept: string): Promise<{ status: number; body: string | null; error?: string }> {
    try {
      const res = await this.fetchImpl(url, { method: 'GET', headers: { Accept: accept }, signal: AbortSignal.timeout(timeoutMs) });
      let body = await res.text();
      if (body.length > MAX_BODY_CHARS) body = body.slice(0, MAX_BODY_CHARS);
      return { status: res.status, body };
    } catch (err) {
      return { status: 0, body: null, error: reason(err, timeoutMs) };
    }
  }
}

interface PromSeries {
  metric?: Record<string, string>;
  value?: [number, string];
  values?: [number, string][];
}
interface PromResponse {
  status?: string;
  error?: string;
  data?: { resultType?: string; result?: PromSeries[] };
}

function actuatorStatus(status: number, body: string | null): [ServiceStatus, Partial<ServiceCheck>] {
  let parsed: { status?: unknown; components?: Record<string, { status?: unknown }> } | null = null;
  try {
    parsed = body ? JSON.parse(body) : null;
  } catch {
    parsed = null;
  }
  if (!parsed || typeof parsed.status !== 'string') {
    return status >= 400 ? ['DOWN', { reason: `HTTP ${status}` }] : ['UNKNOWN', { reason: `HTTP ${status}, not an actuator health answer` }];
  }
  const components =
    parsed.components && typeof parsed.components === 'object'
      ? Object.fromEntries(Object.entries(parsed.components).map(([k, v]) => [k, typeof v?.status === 'string' ? v.status : 'UNKNOWN']))
      : undefined;
  const extra = components ? { components } : {};
  if (parsed.status === 'UP') return ['UP', extra];
  if (parsed.status === 'DOWN' || parsed.status === 'OUT_OF_SERVICE') {
    const down = components ? Object.entries(components).filter(([, s]) => s !== 'UP').map(([k]) => k) : [];
    return ['DOWN', { ...extra, reason: `${parsed.status}${down.length ? ` (${down.join(', ')})` : ''}` }];
  }
  return ['UNKNOWN', { ...extra, reason: `status ${parsed.status}` }];
}

/** Null when the port accepted a connection, else the reason. */
function tcpConnect(host: string, port: number, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const finish = (error: string | null) => {
      socket.destroy();
      resolve(error);
    };
    socket.setTimeout(timeoutMs, () => finish(`timeout after ${timeoutMs} ms`));
    socket.once('connect', () => finish(null));
    socket.once('error', (err: NodeJS.ErrnoException) => finish(`not reachable: ${err.code ?? err.message}`));
  });
}

/** A human reason for a failed fetch. */
function reason(err: unknown, timeoutMs: number): string {
  const e = err as Error & { cause?: { code?: string; message?: string } };
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return `timeout after ${timeoutMs} ms`;
  const cause = e?.cause?.code ?? e?.cause?.message;
  return `not reachable: ${cause ?? e?.message ?? String(err)}`;
}
