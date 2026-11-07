/**
 * Shared monitor types (SPEC-0053). The renderer calls `monitor.health()` and `monitor.metrics()`
 * over IPC; the main process returns these shapes after reading oms-core's actuator endpoints. The
 * renderer never talks to oms-core directly.
 */

/** The top-level status of `/actuator/health`, as Spring Boot reports it. */
export type OmsHealthStatus = 'UP' | 'DOWN' | 'OUT_OF_SERVICE' | 'unknown';

/** One component of the actuator health payload (e.g. `db`, `diskSpace`). */
export interface OmsHealthComponent {
  status: string;
}

/** The parsed body of `/actuator/health`. */
export interface OmsHealth {
  status: string;
  components?: Record<string, OmsHealthComponent>;
}

/** The result of `monitor:health`. `ok` is false (with `error`) when oms-core is unreachable. */
export interface MonitorHealthResult {
  ok: boolean;
  /** HTTP status, or null when no response was received. */
  status: number | null;
  body: OmsHealth | null;
  /** The configured oms-core base URL, shown in the UI. */
  url: string;
  error?: string;
}

/** The result of `monitor:metrics`. `raw` is the `/actuator/prometheus` text (possibly truncated). */
export interface MonitorMetricsResult {
  ok: boolean;
  /** HTTP status, or null when no response was received (timeout / unreachable). */
  status: number | null;
  /** The Prometheus text exposition format, truncated to 5 MB when larger; null on failure. */
  raw: string | null;
  url: string;
  error?: string;
  /** True when `raw` was cut at the 5 MB limit. */
  truncated?: boolean;
}

/** One row of the "Orders by state" tile. */
export interface OrderStateCount {
  state: string;
  value: number;
}

/** The outbox headline numbers. `oldestAgeSeconds` is null when no outbox rows are pending. */
export interface OutboxMetrics {
  pending: number;
  stuck: number;
  oldestAgeSeconds: number | null;
}

/**
 * The OMS-domain metrics the tiles display, parsed from the Prometheus text. Missing series are
 * represented as `null` / empty arrays, never as exceptions.
 */
export interface ParsedMetrics {
  ordersByState: OrderStateCount[];
  /** Sum of all `oms-order-events-total{event=…}` counters. */
  eventsTotal: number;
  /** Interpolated p99 of `oms-order-time-to-ack-seconds` in ms; null when no usable buckets. */
  timeToAckP99Ms: number | null;
  /** Interpolated p99 of `oms-order-time-to-market-seconds` in ms; null when no usable buckets. */
  timeToMarketP99Ms: number | null;
  outbox: OutboxMetrics;
}

/** The combined health + metrics snapshot the store keeps between polls. */
export interface MonitorSample {
  health: MonitorHealthResult | null;
  metrics: MonitorMetricsResult | null;
  /** Parsed from `metrics.raw`; null until a successful metrics poll. */
  parsed: ParsedMetrics | null;
  /** Epoch ms of the last successful poll. */
  updatedAt: number;
  url: string;
}
