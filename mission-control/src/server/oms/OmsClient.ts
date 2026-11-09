import { Agent, fetch } from 'undici';

export type CreateResult =
  | { ok: true; orderId: string }
  | { ok: false; status: number | null; message: string; body?: string };

const MAX_BODY = 2000;

/** oms-core's REST API: the command endpoint for creates, the query API and health for the rest. */
export class OmsClient {
  private readonly agent: Agent;
  private readonly timeoutMs: number;

  constructor(
    readonly baseUrl: string,
    opts: { timeoutMs?: number; connections?: number } = {},
  ) {
    this.timeoutMs = opts.timeoutMs ?? 5000;
    this.agent = new Agent({ connections: opts.connections ?? 512, keepAliveTimeout: 30_000, pipelining: 1 });
  }

  /** POST /api/command/execute; a 201 carries the new order's id. Never throws. */
  async create(command: unknown): Promise<CreateResult> {
    try {
      const res = await fetch(`${this.baseUrl}/api/command/execute`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(command),
        dispatcher: this.agent,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const text = await res.text();
      if (res.status === 201) {
        const id = safeJson(text)?.id;
        if (typeof id === 'string' && id) return { ok: true, orderId: id };
        return { ok: false, status: res.status, message: '201 without an order id', body: text.slice(0, MAX_BODY) };
      }
      return { ok: false, status: res.status, message: `HTTP ${res.status}`, body: text.slice(0, MAX_BODY) };
    } catch (e) {
      const err = e as Error;
      const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
      return { ok: false, status: null, message: timedOut ? `timeout after ${this.timeoutMs} ms` : err.message };
    }
  }

  /** GET /actuator/health → HTTP status (0 when unreachable). */
  async health(timeoutMs = 3000): Promise<number> {
    try {
      const res = await fetch(`${this.baseUrl}/actuator/health`, { dispatcher: this.agent, signal: AbortSignal.timeout(timeoutMs) });
      await res.arrayBuffer();
      return res.status;
    } catch {
      return 0;
    }
  }

  /** GET /api/query/orders/{orderId}/events (read-only query API). */
  async orderEvents(orderId: string): Promise<{ status: number; body: unknown }> {
    const res = await fetch(`${this.baseUrl}/api/query/orders/${encodeURIComponent(orderId)}/events`, {
      dispatcher: this.agent,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const text = await res.text();
    return { status: res.status, body: safeJson(text) ?? text };
  }

  async close(): Promise<void> {
    await this.agent.close();
  }
}

function safeJson(text: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
