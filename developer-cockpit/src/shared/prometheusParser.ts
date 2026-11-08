import type { ParsedMetrics, OrderStateCount, OutboxMetrics } from './types/monitor';

/**
 * Parses the Prometheus text exposition format into the OMS-domain series the Monitor tiles
 * display (SPEC-0053, design → Decision 2). A deliberate, dependency-free replacement for a full
 * Prometheus client: only ~6 known series are needed, and the raw pane shows everything else.
 *
 * Prometheus names: Micrometer dots become dashes and counters get a `_total` suffix, so
 * `oms.order.events` → `oms-order-events-total`. All missing series are `null`/empty, never thrown.
 */
export function parsePrometheus(raw: string): ParsedMetrics {
  const ordersByState: OrderStateCount[] = [];
  let eventsTotal = 0;
  const ackBuckets: Bucket[] = [];
  const marketBuckets: Bucket[] = [];
  const outbox: OutboxMetrics = { pending: 0, stuck: 0, oldestAgeSeconds: null };

  if (!raw) return { ordersByState, eventsTotal, timeToAckP99Ms: null, timeToMarketP99Ms: null, outbox };

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = /^([a-zA-Z_:][a-zA-Z0-9_:\-]*)(\{[^}]*\})?\s+(\S+)$/.exec(trimmed);
    if (!m) continue;
    const name = m[1];
    const group = m[2];
    const valueText = m[3];
    if (valueText === '-Inf' || valueText === '+Inf') continue;

    switch (name) {
      case 'oms-orders-by-state': {
        const state = labelOf(group, 'state');
        if (state !== undefined) {
          const value = parseFloat(valueText);
          if (!Number.isNaN(value) && value !== 0) ordersByState.push({ state, value });
        }
        break;
      }
      case 'oms-order-events-total': {
        const v = parseFloat(valueText);
        if (!Number.isNaN(v)) eventsTotal += v;
        break;
      }
      case 'oms-order-time-to-ack-seconds_bucket': {
        const le = labelOf(group, 'le');
        if (le !== undefined) ackBuckets.push(bucketOf(le, valueText));
        break;
      }
      case 'oms-order-time-to-market-seconds_bucket': {
        const le = labelOf(group, 'le');
        if (le !== undefined) marketBuckets.push(bucketOf(le, valueText));
        break;
      }
      case 'oms-outbox-pending': {
        const v = parseFloat(valueText);
        if (!Number.isNaN(v)) outbox.pending = v;
        break;
      }
      case 'oms-outbox-stuck': {
        const v = parseFloat(valueText);
        if (!Number.isNaN(v)) outbox.stuck = v;
        break;
      }
      case 'oms-outbox-oldest-age-seconds': {
        const v = parseFloat(valueText);
        if (!Number.isNaN(v)) outbox.oldestAgeSeconds = v;
        break;
      }
      default:
        break;
    }
  }

  return {
    ordersByState,
    eventsTotal,
    timeToAckP99Ms: p99Ms(ackBuckets),
    timeToMarketP99Ms: p99Ms(marketBuckets),
    outbox,
  };
}

interface Bucket {
  /** The upper bound in seconds; null for the `+Inf` bucket. */
  le: number | null;
  count: number;
}

/** `le="0.01"` → `{le:0.01,count}`; `le="+Inf"` → `{le:null,count}`. */
function bucketOf(le: string, valueText: string): Bucket {
  const count = parseFloat(valueText);
  if (le === '+Inf') return { le: null, count: Number.isNaN(count) ? 0 : count };
  const bound = parseFloat(le);
  if (Number.isNaN(bound) || Number.isNaN(count)) return { le: null, count: 0 };
  return { le: bound, count };
}

/**
 * The value of one label out of a `{k="v",…}` group, parsed with plain string ops (no regex, to
 * avoid escaping pitfalls). Returns undefined when the group or label is absent.
 */
function labelOf(group: string | undefined, key: string): string | undefined {
  if (!group) return undefined;
  const inner = group.slice(1, -1);
  for (const part of inner.split(',')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    let v = part.slice(eq + 1).trim();
    if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (k === key) return v;
  }
  return undefined;
}

/**
 * Interpolated p99 in milliseconds, following Prometheus `histogram_quantile` semantics
 * (design → Decision 3). The 99th-percentile rank is `0.99·total`; it lands in some bucket and is
 * linearly interpolated between that bucket's previous and current bounds. Because a p99 rank
 * almost always lands in the `+Inf` bucket (every observation is below the 99th percentile), the
 * common case interpolates within the last *finite* bucket. Returns null when there is no total or
 * no finite bucket.
 */
function p99Ms(buckets: Bucket[]): number | null {
  // Prometheus histogram buckets carry *cumulative* counts (le=X means "values <= X"), so the
  // per-bucket delta is the difference from the previous cumulative. total is the last (or +Inf)
  // cumulative count.
  const total = buckets.length ? buckets[buckets.length - 1].count : 0;
  const finite = buckets.filter((b) => b.le !== null && b.le > 0);
  if (total <= 0 || finite.length === 0) return null;

  const threshold = 0.99 * total;
  let prevCumulative = 0;
  let prevLe: number | null = null;

  for (const b of buckets) {
    const cumulative = b.count; // already cumulative
    const delta = cumulative - prevCumulative;
    if (cumulative < threshold) {
      if (b.le !== null) prevLe = b.le;
      prevCumulative = cumulative;
      continue;
    }
    // This bucket contains the 99th-percentile rank (cumulative >= threshold).
    if (b.le === null) {
      // The rank is in the +Inf bucket: every finite value sits below it. The last finite bucket
      // holds the remaining finite values over [its previous cumulative, its cumulative].
      const last = finite[finite.length - 1];
      const lastLe = last.le;
      if (lastLe === null) return null;
      const lastPrevCum = prevCumulative; // cumulative just before the last finite bucket
      const lastDelta = last.count - lastPrevCum;
      const frac = lastDelta > 0 ? (threshold - lastPrevCum) / lastDelta : 0;
      const lo = prevLe ?? 0;
      return (lo + Math.min(1, frac) * (lastLe - lo)) * 1000;
    }
    // The rank is in a finite bucket: interpolate between the previous bound and this bucket's bound.
    const bLe = b.le;
    if (bLe === null) return null;
    const lo = prevLe ?? 0;
    const frac = delta > 0 ? (threshold - prevCumulative) / delta : 0;
    prevCumulative = cumulative;
    return (lo + Math.min(1, frac) * (bLe - lo)) * 1000;
  }

  const maxLe = finite[finite.length - 1].le;
  return maxLe === null ? null : maxLe * 1000;
}
