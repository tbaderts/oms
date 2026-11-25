import { HTTP_METHODS, SAFE_METHODS, isLocalHost, type ApiRequest, type ApiResponse } from '../../shared/apiExplorer';

export const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BODY_CHARS = 5 * 1024 * 1024;
/** Headers the explorer does not let a request set: the runtime manages them. */
const FORBIDDEN_HEADERS = ['host', 'content-length', 'connection', 'transfer-encoding'];

export interface HttpRequestOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
  log?: (line: string) => void;
}

/**
 * Sends the API Explorer's requests (SPEC-0076). Runs in the main process (no CSP or CORS
 * involved) and never throws: every failure is an ApiResponse with `status: null` and an `error`.
 * Only http(s) URLs are sent; a request that may change something (anything but GET, HEAD and
 * OPTIONS) to a non-local host is refused unless `confirmedHost` names that host. Redirects are
 * returned as they are (status 3xx with its Location header), never followed.
 */
export class HttpRequestService {
  private fetchImpl: typeof fetch;
  private timeoutMs: number;
  private log: (line: string) => void;

  constructor(opts: HttpRequestOptions = {}) {
    this.fetchImpl = opts.fetch ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS;
    this.log = opts.log ?? ((line) => console.info(line));
  }

  async send(req: ApiRequest, confirmedHost?: string): Promise<ApiResponse> {
    const method = String(req?.method ?? '').toUpperCase();
    const rawUrl = String(req?.url ?? '').trim();
    if (!(HTTP_METHODS as readonly string[]).includes(method)) return refused(rawUrl, `Unsupported method ${method || '(none)'}`);
    let url: URL;
    try {
      url = new URL(rawUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error();
    } catch {
      return refused(rawUrl, `Invalid URL: ${rawUrl || '(empty)'}`);
    }
    if (/\{[^}]+\}/.test(decodeURI(url.pathname))) return refused(rawUrl, `Fill in the path parameters: ${decodeURI(url.pathname)}`);
    if (!SAFE_METHODS.includes(method) && !isLocalHost(rawUrl) && confirmedHost !== url.hostname) {
      return refused(rawUrl, `Sending ${method} to ${url.hostname} needs confirmation`);
    }

    const headers: Record<string, string> = { Accept: 'application/json, application/problem+json, */*;q=0.5' };
    for (const [k, v] of Object.entries(req.headers ?? {})) {
      if (typeof v === 'string' && k.trim() && !FORBIDDEN_HEADERS.includes(k.trim().toLowerCase())) headers[k.trim()] = v;
    }
    const hasBody = !['GET', 'HEAD'].includes(method) && typeof req.body === 'string' && req.body !== '';
    if (hasBody && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json';

    const started = performance.now();
    const elapsed = () => Math.round(performance.now() - started);
    const logLine = (status: number | string) => this.log(`[api-explorer] ${method} ${url.host}${url.pathname} ${status} ${elapsed()}ms`);
    try {
      const res = await this.fetchImpl(url, {
        method,
        headers,
        // A redirect is answered, not followed: following it could replay the request to a host
        // that was never confirmed.
        redirect: 'manual',
        ...(hasBody ? { body: req.body } : {}),
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
      return { ok: res.status < 400, status: res.status, durationMs: elapsed(), body: parsed, contentType, url: url.toString(), ...(error ? { error } : {}) };
    } catch (err) {
      logLine('unreachable');
      return { ok: false, status: null, durationMs: elapsed(), body: null, contentType: '', url: url.toString(), error: `Not reachable: ${url.origin}: ${reason(err, this.timeoutMs)}` };
    }
  }
}

/** A request refused before it was sent. */
function refused(url: string, error: string): ApiResponse {
  return { ok: false, status: null, durationMs: 0, body: null, contentType: '', url, error, refused: true };
}

function reason(err: unknown, timeoutMs: number): string {
  const e = err as Error & { cause?: { code?: string; message?: string } };
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return `timeout after ${timeoutMs} ms`;
  const cause = e?.cause?.code ?? e?.cause?.message;
  return cause ? `${e.message} (${cause})` : (e?.message ?? String(err));
}
