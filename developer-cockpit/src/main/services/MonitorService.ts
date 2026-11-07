import { REQUEST_TIMEOUT_MS } from './OmsHttpService';
import type { MonitorHealthResult, MonitorMetricsResult, OmsHealth } from '../../shared/types/monitor';

/** Same 5 MB response cap as `OmsHttpService` (kept local to avoid a cross-module import of a private const). */
const MAX_BODY_CHARS = 5 * 1024 * 1024;

/**
 * Reads oms-core's Spring Boot Actuator endpoints for the Monitor view (SPEC-0053). Runs in the
 * main process (no CSP/CORS, as in `OmsHttpService`) and never throws: every failure comes back as
 * a typed result with `ok: false` and an `error` naming the configured URL and the reason.
 *
 * Two endpoints are read (design → Decision 1):
 * - `GET /actuator/health` → the service state (UP / DOWN / OUT_OF_SERVICE).
 * - `GET /actuator/prometheus` → the raw Prometheus text, parsed in the renderer's `parsePrometheus`.
 *
 * `fetch` and `timeoutMs` are injectable for tests (same seam as `OmsHttpService`).
 */
export interface MonitorServiceOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
  log?: (line: string) => void;
}

export class MonitorService {
  private fetchImpl: typeof fetch;
  private timeoutMs: number;
  private log: (line: string) => void;

  constructor(
    private getBaseUrl: () => string,
    opts: MonitorServiceOptions = {},
  ) {
    this.fetchImpl = opts.fetch ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS;
    this.log = opts.log ?? ((line) => console.info(line));
  }

  /** `GET /actuator/health`. `body` is null when the response is not JSON or the call failed. */
  async health(): Promise<MonitorHealthResult> {
    const r = await this.request('/actuator/health');
    if (!r.ok) {
      return { ok: false, status: r.status, body: null, url: r.url, error: r.error };
    }
    const body = parseHealth(r.raw);
    if (!body) {
      return { ok: true, status: r.status, body: null, url: r.url, error: r.truncated ? 'health response truncated' : undefined };
    }
    return { ok: true, status: r.status, body, url: r.url };
  }

  /** `GET /actuator/prometheus`. `raw` is the (possibly truncated) Prometheus text. */
  async prometheus(): Promise<MonitorMetricsResult> {
    const r = await this.request('/actuator/prometheus');
    if (!r.ok) {
      return { ok: false, status: r.status, raw: null, url: r.url, error: r.error };
    }
    return { ok: true, status: r.status, raw: r.raw ?? '', url: r.url, ...(r.truncated ? { truncated: true } : {}) };
  }

  /**
   * One actuator GET. Returns the raw text (the prometheus endpoint is `text/plain`, health is
   * JSON but we keep the raw text and parse it in `health()`), applying the 10 s timeout and the
   * 5 MB truncation. Never throws.
   */
  private async request(path: string): Promise<{ ok: boolean; status: number | null; raw: string | null; url: string; error?: string; truncated?: boolean }> {
    const rawBase = this.getBaseUrl().trim();
    let base: string;
    try {
      const url = new URL(rawBase);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('bad protocol');
      base = rawBase.replace(/\/+$/, '');
    } catch {
      return { ok: false, status: null, raw: null, url: rawBase, error: `Invalid oms-core URL: ${rawBase}` };
    }
    const url = base + path;
    const started = performance.now();
    const elapsed = () => Math.round(performance.now() - started);
    const logLine = (status: number | string) =>
      this.log(`[monitor] GET ${path} ${status} ${elapsed()}ms`);
    try {
      const res = await this.fetchImpl(url, {
        method: 'GET',
        headers: { Accept: 'text/plain, application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      let text = await res.text();
      let error: string | undefined;
      if (text.length > MAX_BODY_CHARS) {
        text = text.slice(0, MAX_BODY_CHARS);
        error = `Response truncated to ${MAX_BODY_CHARS} characters`;
      }
      logLine(res.status);
      return {
        ok: res.status < 400,
        status: res.status,
        raw: text,
        url,
        ...(res.status >= 400 ? { error: `HTTP ${res.status}` } : error ? { error } : {}),
        ...(text.length >= MAX_BODY_CHARS ? { truncated: true } : {}),
      };
    } catch (err) {
      logLine('unreachable');
      return { ok: false, status: null, raw: null, url, error: `oms-core not reachable at ${base}: ${reason(err, this.timeoutMs)}` };
    }
  }
}

/** Parse the `/actuator/health` JSON body into an `OmsHealth`; null when it is not the expected shape. */
function parseHealth(raw: string | null): OmsHealth | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (typeof obj !== 'object' || obj === null || typeof obj.status !== 'string') return null;
    const components =
      obj.components && typeof obj.components === 'object'
        ? (Object.fromEntries(
            Object.entries(obj.components as Record<string, unknown>).map(([k, v]) => [
              k,
              { status: (v as { status?: string })?.status ?? 'unknown' },
            ]),
          ) as OmsHealth['components'])
        : undefined;
    return { status: obj.status, ...(components ? { components } : {}) };
  } catch {
    return null;
  }
}

/** A human reason for a failed fetch, mirroring `OmsHttpService.reason`. */
function reason(err: unknown, timeoutMs: number): string {
  const e = err as Error & { cause?: { code?: string; message?: string } };
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return `timeout after ${timeoutMs} ms`;
  const cause = e?.cause?.code ?? e?.cause?.message;
  return cause ? `${e?.message ?? String(err)} (${cause})` : (e?.message ?? String(err));
}
