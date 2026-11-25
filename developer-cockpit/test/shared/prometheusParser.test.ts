import { describe, expect, it } from 'vitest';
import { groupBy, histogramQuantile, parsePrometheusText, sumMatching } from '../../src/shared/prometheusParser';

const TEXT = `
# HELP jobs_by_state Jobs per state
# TYPE jobs_by_state gauge
jobs_by_state{state="queued",app="shop"} 4
jobs_by_state{state="running",app="shop"} 2
jobs_by_state{state="queued",app="other"} 1
requests_total{path="/a b",note="say \\"hi\\""} 10 1700000000000
requests_total{path="/c"} 5
temperature NaN
weird line without value
latency_seconds_bucket{le="0.1"} 50
latency_seconds_bucket{le="0.5"} 90
latency_seconds_bucket{le="1.0"} 100
latency_seconds_bucket{le="+Inf"} 100
latency_seconds_count 100
`;

describe('prometheusParser', () => {
  it('parsesTextFormat', () => {
    const samples = parsePrometheusText(TEXT);
    expect(samples).toContainEqual({ name: 'jobs_by_state', labels: { state: 'queued', app: 'shop' }, value: 4 });
    expect(samples).toContainEqual({ name: 'requests_total', labels: { path: '/a b', note: 'say "hi"' }, value: 10 });
    expect(samples.find((s) => s.name === 'temperature')?.value).toBeNaN();
    expect(samples.find((s) => s.name === 'latency_seconds_bucket' && s.labels.le === '+Inf')?.value).toBe(100);
    expect(samples.some((s) => s.name === 'weird')).toBe(false);
    expect(parsePrometheusText('')).toEqual([]);
    expect(parsePrometheusText(null)).toEqual([]);
  });

  it('sums matching samples, null when none match', () => {
    const s = parsePrometheusText(TEXT);
    expect(sumMatching(s, 'requests_total')).toBe(15);
    expect(sumMatching(s, 'jobs_by_state', { app: 'shop' })).toBe(6);
    expect(sumMatching(s, 'temperature')).toBeNull();
    expect(sumMatching(s, 'missing')).toBeNull();
  });

  it('groups by a label in first-seen order', () => {
    const s = parsePrometheusText(TEXT);
    expect(groupBy(s, 'jobs_by_state', 'state')).toEqual([
      { label: 'queued', value: 5 },
      { label: 'running', value: 2 },
    ]);
    expect(groupBy(s, 'jobs_by_state', 'state', { app: 'other' })).toEqual([{ label: 'queued', value: 1 }]);
  });

  it('interpolates histogram quantiles like histogram_quantile', () => {
    const s = parsePrometheusText(TEXT);
    // rank 50 → exactly the 0.1 bucket's upper bound
    expect(histogramQuantile(s, 'latency_seconds', 0.5)).toBeCloseTo(0.1);
    // rank 70 → halfway through (0.1, 0.5]
    expect(histogramQuantile(s, 'latency_seconds', 0.7)).toBeCloseTo(0.3);
    // rank 99 → 90% through (0.5, 1.0]
    expect(histogramQuantile(s, 'latency_seconds', 0.99)).toBeCloseTo(0.95);
  });

  it('a quantile in the +Inf bucket is the highest finite bound; no data is null', () => {
    const inf = parsePrometheusText('h_bucket{le="1"} 10\nh_bucket{le="+Inf"} 20\n');
    expect(histogramQuantile(inf, 'h', 0.99)).toBe(1);
    expect(histogramQuantile(parsePrometheusText('h_bucket{le="+Inf"} 0\n'), 'h', 0.5)).toBeNull();
    expect(histogramQuantile([], 'h', 0.5)).toBeNull();
  });

  it('sums buckets across series per le', () => {
    const s = parsePrometheusText('h_bucket{uri="/a",le="1"} 5\nh_bucket{uri="/b",le="1"} 5\nh_bucket{uri="/a",le="+Inf"} 5\nh_bucket{uri="/b",le="+Inf"} 5\n');
    expect(histogramQuantile(s, 'h', 0.5)).toBeCloseTo(0.5);
    expect(histogramQuantile(s, 'h', 0.5, { uri: '/a' })).toBeCloseTo(0.5);
  });
});
