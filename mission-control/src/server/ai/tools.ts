import { z } from 'zod';
import { FIGURES, FIGURE_LABELS, type FigureStats, type OrderSample, type RunConfig, type RunSummary, type SeriesPoint } from '../../shared/types.js';
import type { OmsClient } from '../oms/OmsClient.js';
import { sortSamples } from '../api/routes.js';

/** What the agent investigates: a finished run, or the live state of the active one. */
export interface RunContext {
  config: RunConfig;
  summary: RunSummary;
  series: SeriesPoint[];
  samples: OrderSample[];
}

export interface ToolDeps {
  run: RunContext;
  oms: Pick<OmsClient, 'orderEvents'>;
  mimirUrl: string;
  lokiUrl: string;
}

/** A tool result handed to the model is capped, so one query cannot flood the context. */
const MAX_TOOL_CHARS = 16_000;
const MARGIN_MS = 60_000;

/** The run's time window, with a minute either side (design: AI investigation). */
export function runWindow(run: RunContext): { start: number; end: number } {
  return { start: run.summary.startedAt - MARGIN_MS, end: (run.summary.endedAt ?? Date.now()) + MARGIN_MS };
}

const compact = (s: FigureStats) => ({ count: s.count, p50: s.p50, p95: s.p95, p99: s.p99, max: s.max });

/** The investigation tools, each closed over one run. Plain AI SDK tool objects with zod input schemas. */
export function buildTools(d: ToolDeps): Record<string, unknown> {
  const w = runWindow(d.run);
  return {
    runSummary: {
      description: 'Summary of the load run: configuration, target and achieved rate, counts, create errors, venue rejects, incomplete orders, and p50/p95/p99/max per latency figure and per OMS checkpoint delta (ms).',
      inputSchema: z.object({}),
      execute: async () => {
        const s = d.run.summary;
        return cap({
          config: d.run.config,
          ...s,
          createErrors: s.createErrors.slice(0, 20),
          rejected: s.rejected.slice(0, 20),
          incomplete: s.incomplete.slice(0, 20),
          figures: Object.fromEntries(FIGURES.map((f) => [f, { label: FIGURE_LABELS[f], ...compact(s.figures[f]) }])),
          deltas: Object.fromEntries(Object.entries(s.deltas).map(([k, v]) => [k, compact(v)])),
          seriesPerSecond: d.run.series.map((p) => ({ t: p.t, submitted: p.submitted, completed: p.completed, toFilledP99: p.p.toFilled?.p99 })),
        });
      },
    },
    slowestOrders: {
      description: 'The slowest orders of the run by one latency figure, with each order\'s state timeline, figures and OMS checkpoint deltas.',
      inputSchema: z.object({ figure: z.enum(FIGURES), limit: z.number().int().min(1).max(50).default(10) }),
      execute: async ({ figure, limit }: { figure: (typeof FIGURES)[number]; limit: number }) =>
        cap(sortSamples(d.run.samples, figure).filter((s) => s.figures[figure] !== undefined).slice(0, limit)),
    },
    orderEvents: {
      description: "An order's event history from oms-core's read-only query API (GET /api/query/orders/{orderId}/events).",
      inputSchema: z.object({ orderId: z.string().min(1).max(100) }),
      execute: async ({ orderId }: { orderId: string }) => cap(await d.oms.orderEvents(orderId)),
    },
    queryMetrics: {
      description: 'A PromQL range query against Mimir over the run window. Useful series: oms_order_events, oms_orders_by_state, oms_outbox_pending, oms_outbox_oldest_age, oms_commands_consumed, oms_order_time_to_market_bucket, kafka consumer lag, JVM and HTTP metrics; every series has service_name.',
      inputSchema: z.object({ promql: z.string().min(1).max(2000), stepSeconds: z.number().int().min(1).max(300).default(15) }),
      execute: async ({ promql, stepSeconds }: { promql: string; stepSeconds: number }) => {
        const q = new URLSearchParams({ query: promql, start: String(w.start / 1000), end: String(w.end / 1000), step: String(stepSeconds) });
        return cap(await getJson(`${d.mimirUrl}/api/v1/query_range?${q}`));
      },
    },
    queryLogs: {
      description: 'A LogQL range query against Loki over the run window, newest first. Streams are labelled service_name (oms-core, oms-exchange-simulator, …).',
      inputSchema: z.object({ logql: z.string().min(1).max(2000), limit: z.number().int().min(1).max(200).default(100) }),
      execute: async ({ logql, limit }: { logql: string; limit: number }) => {
        const ns = (ms: number) => String(BigInt(Math.round(ms)) * 1_000_000n);
        const q = new URLSearchParams({ query: logql, start: ns(w.start), end: ns(w.end), limit: String(limit), direction: 'backward' });
        return cap(await getJson(`${d.lokiUrl}/loki/api/v1/query_range?${q}`));
      },
    },
  };
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text };
  }
}

function cap(v: unknown): string {
  const s = JSON.stringify(v);
  return s.length > MAX_TOOL_CHARS ? s.slice(0, MAX_TOOL_CHARS) + `… [truncated ${s.length - MAX_TOOL_CHARS} chars]` : s;
}
