import { describe, expect, it } from 'vitest';
import { parsePrometheus } from '../../src/shared/prometheusParser';

/**
 * A fixture using the exact Prometheus-form series names oms-core's Micrometer meters produce
 * (dots become dashes, counters get a `_total` suffix, timers export `_seconds` histograms):
 * - `oms-orders-by-state{state="…"}` gauges (NEW, LIVE, FILLED, CXL present; zero states omitted)
 * - `oms-order-events-total{event="…"}` counters
 * - `oms-order-time-to-{ack,market}-seconds_bucket{le="…"}` histogram buckets (+ `_count`)
 * - `oms-outbox-pending`, `oms-outbox-stuck`, `oms-outbox-oldest-age-seconds` gauges
 * Plus unrelated series (jvm, http) that must be ignored.
 */
const FIXTURE = [
  '# HELP oms_orders_by_state Orders currently in this state',
  '# TYPE oms_orders_by_state gauge',
  'oms-orders-by-state{state="NEW"} 3',
  'oms-orders-by-state{state="LIVE"} 5',
  'oms-orders-by-state{state="FILLED"} 2',
  'oms-orders-by-state{state="CXL"} 1',
  // A zero gauge is present in the input and must be omitted from the parsed result (AC-2).
  'oms-orders-by-state{state="REJ"} 0',
  '# TYPE oms_order_events counter',
  'oms-order-events-total{event="ORDER_ACCEPTED"} 10',
  'oms-order-events-total{event="ORDER_FILLED"} 4',
  'oms-order-events-total{event="ORDER_CANCELLED"} 2',
  '# TYPE oms_order_time_to_ack summary',
  'oms-order-time-to-ack-seconds_bucket{le="0.001"} 3',
  'oms-order-time-to-ack-seconds_bucket{le="0.01"} 8',
  'oms-order-time-to-ack-seconds_bucket{le="0.1"} 11',
  'oms-order-time-to-ack-seconds_bucket{le="+Inf"} 12',
  'oms-order-time-to-ack-seconds_count 12',
  'oms-order-time-to-ack-seconds_sum 0.42',
  '# TYPE oms_order_time_to_market summary',
  'oms-order-time-to-market-seconds_bucket{le="0.001"} 1',
  'oms-order-time-to-market-seconds_bucket{le="0.01"} 5',
  'oms-order-time-to-market-seconds_bucket{le="0.1"} 10',
  'oms-order-time-to-market-seconds_bucket{le="+Inf"} 12',
  'oms-order-time-to-market-seconds_count 12',
  'oms-order-time-to-market-seconds_sum 0.66',
  '# TYPE oms_outbox_pending gauge',
  'oms-outbox-pending 4',
  'oms-outbox-stuck 0',
  'oms-outbox-oldest-age-seconds 12.5',
  '# unrelated, must be ignored',
  'jvm_memory_used_bytes{area="heap"} 1000',
  'http_server_requests_seconds_count 7',
  '',
].join('\n');

describe('parsePrometheus', () => {
  it('AC-2: lists each non-zero order state with its value, omitting zero-value states', () => {
    const m = parsePrometheus(FIXTURE);
    expect(m.ordersByState).toEqual([
      { state: 'NEW', value: 3 },
      { state: 'LIVE', value: 5 },
      { state: 'FILLED', value: 2 },
      { state: 'CXL', value: 1 },
    ]);
    // The fixture contains a `oms-orders-by-state{state="REJ"} 0` line; the parser must omit it.
    expect(m.ordersByState.some((s) => s.state === 'REJ')).toBe(false);
  });

  it('AC-2: a zero gauge present in the input is omitted from the result', () => {
    // Directly feeds a zero line (and a non-zero one) to prove the zero is dropped, not just
    // absent from a curated fixture.
    const raw = 'oms-orders-by-state{state="NEW"} 2\noms-orders-by-state{state="REJ"} 0';
    const m = parsePrometheus(raw);
    expect(m.ordersByState).toEqual([{ state: 'NEW', value: 2 }]);
  });

  it('AC-3: sums all oms-order-events-total counters', () => {
    expect(parsePrometheus(FIXTURE).eventsTotal).toBe(16); // 10 + 4 + 2
  });

  it('AC-4: interpolates the p99 of time-to-ack from the histogram buckets in ms', () => {
    const m = parsePrometheus(FIXTURE);
    // total=12, 0.99*12=11.88 -> first bucket with cumcount>=11.88 is le=0.1 (cum 11? no: 3,8,11,12)
    // cum: 0.001->3, 0.01->8, 0.1->11, +Inf->12. First bucket with cum>=11.88 is +Inf (12).
    // Interpolate between previous finite bucket (0.1, cum 11) and +Inf: +Inf is unbounded, so the
    // quantile is clamped to the previous finite upper bound (0.1s = 100ms) when the crossing bucket
    // is +Inf.
    expect(m.timeToAckP99Ms).toBeCloseTo(100, 5);
  });

  it('AC-4: interpolates the p99 of time-to-market from the histogram buckets in ms', () => {
    const m = parsePrometheus(FIXTURE);
    // total=12, threshold 11.88 -> first bucket cum>=11.88 is +Inf (12); clamp to previous finite 0.1
    expect(m.timeToMarketP99Ms).toBeCloseTo(100, 5);
  });

  it('AC-4: returns null for a p99 when there are no usable buckets', () => {
    const raw = 'oms-order-time-to-ack-seconds_bucket{le="+Inf"} 0\noms-order-time-to-ack-seconds_count 0';
    const m = parsePrometheus(raw);
    expect(m.timeToAckP99Ms).toBeNull();
  });

  it('AC-5: parses outbox pending, stuck and oldest age', () => {
    const m = parsePrometheus(FIXTURE);
    expect(m.outbox).toEqual({ pending: 4, stuck: 0, oldestAgeSeconds: 12.5 });
  });

  it('AC-5: represents missing outbox series as null / zeros, not exceptions', () => {
    const m = parsePrometheus('jvm_memory_used_bytes{area="heap"} 5');
    expect(m.outbox).toEqual({ pending: 0, stuck: 0, oldestAgeSeconds: null });
    expect(m.eventsTotal).toBe(0);
    expect(m.ordersByState).toEqual([]);
  });

  it('ignores comment lines, blank lines and unrelated series', () => {
    const m = parsePrometheus(FIXTURE);
    // No leaked jvm/http numbers anywhere.
    expect(JSON.stringify(m)).not.toContain('jvm');
    expect(JSON.stringify(m)).not.toContain('http_server');
  });

  it('interpolates within a finite bucket when the quantile falls strictly inside it', () => {
    // total 100: buckets 0->50 (le 0.001), 80 (le 0.01), 100 (le 0.1).
    // p99 -> threshold 99 -> first bucket cum>=99 is 0.1 (100). Previous finite is 0.01 (80).
    // Linear interpolation between 0.01 (80) and 0.1 (100): 99 is (99-80)/(100-80)=0.95 of the way.
    // 0.01 + 0.95*(0.1-0.01) = 0.01 + 0.0855 = 0.0955 s = 95.5 ms
    const raw = [
      'oms-order-time-to-ack-seconds_bucket{le="0.001"} 50',
      'oms-order-time-to-ack-seconds_bucket{le="0.01"} 80',
      'oms-order-time-to-ack-seconds_bucket{le="0.1"} 100',
      'oms-order-time-to-ack-seconds_bucket{le="+Inf"} 100',
      'oms-order-time-to-ack-seconds_count 100',
    ].join('\n');
    const m = parsePrometheus(raw);
    expect(m.timeToAckP99Ms).toBeCloseTo(95.5, 5);
  });
});
