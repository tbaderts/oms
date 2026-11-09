import { z } from 'zod';

/** Order states published by oms-core (`State.avsc`). */
export const ORDER_STATES = ['NEW', 'UNACK', 'LIVE', 'FILLED', 'CXL', 'REJ', 'CLOSED', 'EXP'] as const;
export type OrderState = (typeof ORDER_STATES)[number];
export const TERMINAL_STATES: ReadonlySet<string> = new Set(['FILLED', 'CXL', 'REJ', 'CLOSED', 'EXP']);

/** The latency figures of a run, all measured on Mission Control's clock from the scheduled send time. */
export const FIGURES = ['toOmsAck', 'toMarket', 'toLive', 'toFirstFill', 'toFilled'] as const;
export type Figure = (typeof FIGURES)[number];
export const FIGURE_LABELS: Record<Figure, string> = {
  toOmsAck: 'Time to OMS ack',
  toMarket: 'Time to market',
  toLive: 'Time to order live (market ack)',
  toFirstFill: 'Time to first fill',
  toFilled: 'Time to filled',
};

/** Server-side checkpoint deltas taken from the OrderMessage SLA fields, in ms. */
export const DELTAS = ['omsAck', 'omsToMarket', 'marketRoundTrip'] as const;
export type Delta = (typeof DELTAS)[number];

export const MAX_RATE = 200;
export const MAX_DURATION_SEC = 600;

export const orderTemplate = z.object({
  symbol: z.string().min(1).default('AAPL'),
  side: z.enum(['BUY', 'SELL', 'SELL_SHORT']).default('BUY'),
  ordType: z.enum(['MARKET', 'LIMIT']).default('MARKET'),
  orderQty: z.number().positive().default(100),
  price: z.number().positive().optional(),
  timeInForce: z.string().min(1).default('DAY'),
  securityId: z.string().min(1).default('US0378331005'),
  securityIdSource: z.string().min(1).default('ISIN'),
  account: z.string().min(1).default('mc-account'),
  exDestination: z.string().min(1).default('XSIM'),
  settlCurrency: z.string().min(1).default('USD'),
  handlInst: z.string().min(1).default('AUTO'),
  priceType: z.string().min(1).default('PER_UNIT'),
});
export type OrderTemplate = z.infer<typeof orderTemplate>;

export const runConfig = z.object({
  omsBaseUrl: z.url().default('http://localhost:8090'),
  rate: z.number().min(1).max(MAX_RATE),
  durationSec: z.number().int().min(1).max(MAX_DURATION_SEC),
  template: orderTemplate.default(orderTemplate.parse({})),
  requestTimeoutMs: z.number().int().min(100).max(60_000).default(5000),
  completionTimeoutSec: z.number().int().min(1).max(600).default(30),
  label: z.string().max(200).optional(),
});
export type RunConfig = z.infer<typeof runConfig>;
export type RunConfigInput = z.input<typeof runConfig>;

export type RunStatus = 'PREFLIGHT' | 'RUNNING' | 'DRAINING' | 'COMPLETED' | 'STOPPED' | 'REFUSED';

export interface TimelineEntry {
  state: string;
  seenAt: number;
  eventId: number | null;
}

/** One order created by a run. Times are epoch ms on Mission Control's clock. */
export interface OrderSample {
  seq: number;
  clOrdId: string;
  orderId?: string;
  scheduledAt: number;
  sentAt?: number;
  ackAt?: number;
  error?: { status: number | null; message: string; body?: string };
  timeline: TimelineEntry[];
  figures: Partial<Record<Figure, number>>;
  deltas: Partial<Record<Delta, number>>;
  finalState?: string;
  rejectReason?: string;
}

export interface FigureStats {
  count: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  max: number | null;
  /** Upper bound in ms; null is the overflow bucket (+Inf), so the shape survives JSON. */
  histogram: { le: number | null; count: number }[];
}

export interface SeriesPoint {
  /** Seconds since the run started. */
  t: number;
  submitted: number;
  completed: number;
  p: Partial<Record<Figure, { p50: number; p95: number; p99: number }>>;
}

export interface RunSummary {
  runId: string;
  label?: string;
  status: RunStatus;
  startedAt: number;
  endedAt?: number;
  targetRate: number;
  achievedRate: number | null;
  p99LatenessMs: number | null;
  generatorLimited: boolean;
  scheduled: number;
  sent: number;
  created: number;
  createErrors: { clOrdId: string; status: number | null; message: string; body?: string }[];
  rejected: { clOrdId: string; orderId?: string; reason?: string }[];
  incomplete: { clOrdId: string; orderId?: string; lastState?: string }[];
  stateCounts: Record<string, number>;
  decodeErrors: number;
  figures: Record<Figure, FigureStats>;
  deltas: Record<Delta, FigureStats>;
  refusal?: { check: string; detail: string };
}

export interface Snapshot {
  summary: RunSummary;
  series: SeriesPoint[];
}

/** A decoded Kafka record, reduced to what the tracker needs. Timestamps are epoch µs. */
export type TrackerEvent =
  | {
      kind: 'order';
      sessionId: string | null;
      clOrdId: string | null;
      orderId: string;
      eventId: number | null;
      state: string | null;
      rejectReason: string | null;
      orderReceivedTime: number | null;
      ackTime: number | null;
      marketSendTime: number | null;
      marketAckTime: number | null;
    }
  | {
      kind: 'execution';
      sessionId: string | null;
      clOrdId: string | null;
      orderId: string;
      execId: string;
      orderVersion: number | null;
      state: string | null;
    };

export type AiEvent =
  | { type: 'ai:message'; invId: string; text: string }
  | { type: 'ai:tool-call'; invId: string; toolCallId: string; name: string; input: Record<string, unknown> }
  | { type: 'ai:tool-result'; invId: string; toolCallId: string; name: string; output: string }
  | { type: 'ai:done'; invId: string; aborted: boolean; incomplete: boolean }
  | { type: 'ai:error'; invId: string; kind: 'configuration' | 'provider' | 'validation'; message: string };

export interface AiStatus {
  available: boolean;
  provider: string;
  model?: string;
  reason?: string;
}
