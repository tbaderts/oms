import {
  COMMAND_PATH,
  SEARCH_PATH,
  eventsPath,
  isLocalHost,
  toSearchParams,
  type ApiResponse,
  type OrderFollowUp,
  type Paging,
  type QueryParam,
  type TimelineEvent,
} from '../../shared/apiExplorer';

export const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BODY_CHARS = 5 * 1024 * 1024;

export interface OmsHttpOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
  log?: (line: string) => void;
}

/**
 * Calls oms-core for the API Explorer. Runs in the main process (no CSP or CORS involved) and never
 * throws: every failure comes back as an ApiResponse with `status: null` and an `error`.
 */
export class OmsHttpService {
  private fetchImpl: typeof fetch;
  private timeoutMs: number;
  private log: (line: string) => void;

  constructor(
    private getBaseUrl: () => string,
    opts: OmsHttpOptions = {},
  ) {
    this.fetchImpl = opts.fetch ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS;
    this.log = opts.log ?? ((line) => console.info(line));
  }

  /** POSTs a command. A non-local target needs `confirmedHost` equal to its host name. */
  async sendCommand(bodyText: string, confirmedHost?: string): Promise<ApiResponse> {
    const base = this.base();
    if (typeof base !== 'string') return base;
    try {
      JSON.parse(bodyText);
    } catch {
      return failure(base + COMMAND_PATH, 'The command body is not valid JSON');
    }
    const host = new URL(base).hostname;
    if (!isLocalHost(base) && confirmedHost !== host) {
      return failure(base + COMMAND_PATH, `Sending a command to ${host} needs confirmation`);
    }
    return this.request('POST', base, COMMAND_PATH, bodyText, orderIdIn(bodyText));
  }

  async search(params: QueryParam[], paging: Paging): Promise<ApiResponse> {
    const base = this.base();
    if (typeof base !== 'string') return base;
    let qs: string;
    try {
      qs = toSearchParams(params, paging).toString();
    } catch (err) {
      return failure(base + SEARCH_PATH, (err as Error).message);
    }
    return this.request('GET', base, qs ? `${SEARCH_PATH}?${qs}` : SEARCH_PATH);
  }

  /** The order and its event log, both from the contracted query API, read in parallel. */
  async followUp(orderId: string): Promise<OrderFollowUp> {
    // A blank id would drop the filter and return an arbitrary order.
    if (!orderId.trim()) return { orderId, order: null, events: null, error: 'No order id' };
    const base = this.base();
    if (typeof base !== 'string') return { orderId, order: null, events: null, error: base.error };
    const qs = toSearchParams([{ field: 'orderId', op: 'eq', value: orderId }], { size: 1 }).toString();
    const [orderRes, eventsRes] = await Promise.all([
      this.request('GET', base, `${SEARCH_PATH}?${qs}`, undefined, orderId),
      this.request('GET', base, eventsPath(orderId), undefined, orderId),
    ]);
    const errors: string[] = [];
    const result: OrderFollowUp = { orderId, order: null, events: null };

    if (orderRes.ok) {
      const content = (orderRes.body as { content?: unknown })?.content;
      result.order = Array.isArray(content) && content[0] && typeof content[0] === 'object' ? (content[0] as Record<string, unknown>) : null;
    } else {
      result.orderError = describe(orderRes);
      errors.push(`order: ${result.orderError}`);
    }

    if (eventsRes.ok) {
      const events = toTimeline(eventsRes.body);
      if (events) result.events = events;
      else result.rawEvents = eventsRes.body;
    } else {
      errors.push(`events: ${describe(eventsRes)}`);
    }
    if (errors.length) result.error = errors.join('; ');
    return result;
  }

  /** The configured base URL without a trailing slash, or a failure when it is not http(s). */
  private base(): string | ApiResponse {
    const raw = this.getBaseUrl().trim();
    try {
      const url = new URL(raw);
      if (url.protocol === 'http:' || url.protocol === 'https:') return raw.replace(/\/+$/, '');
    } catch {
      // fall through
    }
    return failure(raw, `Invalid oms-core URL: ${raw}`);
  }

  private async request(method: 'GET' | 'POST', base: string, path: string, body?: string, orderId?: string | null): Promise<ApiResponse> {
    const url = base + path;
    const started = performance.now();
    const elapsed = () => Math.round(performance.now() - started);
    const logLine = (status: number | string) =>
      this.log(`[api-explorer] ${method} ${path.split('?')[0]} ${status} ${elapsed()}ms${orderId ? ` orderId=${orderId}` : ''}`);
    try {
      const res = await this.fetchImpl(url, {
        method,
        headers: {
          Accept: 'application/json, application/problem+json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const contentType = res.headers.get('content-type') ?? '';
      let text = await res.text();
      let error: string | undefined;
      if (text.length > MAX_BODY_CHARS) {
        text = text.slice(0, MAX_BODY_CHARS);
        error = `Response truncated to ${MAX_BODY_CHARS} characters`;
      }
      let parsed: unknown = text;
      if (/json/i.test(contentType) && !error) {
        try {
          parsed = JSON.parse(text);
        } catch {
          // keep the text
        }
      }
      logLine(res.status);
      return { ok: res.status < 400, status: res.status, durationMs: elapsed(), body: parsed, contentType, url, ...(error ? { error } : {}) };
    } catch (err) {
      logLine('unreachable');
      return {
        ok: false,
        status: null,
        durationMs: elapsed(),
        body: null,
        contentType: '',
        url,
        error: `oms-core not reachable at ${base}: ${reason(err, this.timeoutMs)}`,
      };
    }
  }
}

/** A request refused before it was sent. */
function failure(url: string, error: string): ApiResponse {
  return { ok: false, status: null, durationMs: 0, body: null, contentType: '', url, error, refused: true };
}

function reason(err: unknown, timeoutMs: number): string {
  const e = err as Error & { cause?: { code?: string; message?: string } };
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return `timeout after ${timeoutMs} ms`;
  const cause = e?.cause?.code ?? e?.cause?.message;
  return cause ? `${e.message} (${cause})` : (e?.message ?? String(err));
}

function describe(r: ApiResponse): string {
  return r.status === null ? (r.error ?? 'failed') : `HTTP ${r.status}`;
}

function orderIdIn(bodyText: string): string | null {
  try {
    const b = JSON.parse(bodyText);
    return b?.orderId ?? b?.execution?.orderId ?? null;
  } catch {
    return null;
  }
}

/** The event log in the expected shape, sorted by version; null when the shape is not recognised. */
function toTimeline(body: unknown): TimelineEvent[] | null {
  if (!Array.isArray(body)) return null;
  if (!body.every((e) => e && typeof e === 'object' && typeof e.version === 'number' && typeof e.event === 'string')) return null;
  return body
    .map((e) => ({
      version: e.version,
      event: e.event,
      resultingState: e.resultingState ?? null,
      timeStamp: e.timeStamp ?? null,
      transaction: e.transaction ?? null,
      orderSnapshot: e.orderSnapshot ?? null,
    }))
    .sort((a, b) => a.version - b.version);
}
