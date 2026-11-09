import { FIGURES } from '../../src/shared/types';
import { HISTOGRAM_BOUNDS, RunStats, nearestRank, statsOf } from '../../src/server/run/RunStats';

/** Independent reference: nearest-rank percentile over a sorted copy. */
function reference(values: number[], p: number): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil((p / 100) * s.length) - 1)];
}

describe('RunStats (AC-4)', () => {
  it('percentiles equal the reference computation', () => {
    const fixed = [5, 1, 4, 2, 3, 10, 9, 8, 7, 6];
    expect(nearestRank([...fixed].sort((a, b) => a - b), 50)).toBe(5);
    expect(nearestRank([...fixed].sort((a, b) => a - b), 95)).toBe(10);

    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * 5000;
    for (const n of [1, 2, 7, 100, 1001, 20_000]) {
      const values = Array.from({ length: n }, rnd);
      const s = statsOf(values);
      expect(s.count).toBe(n);
      expect(s.p50).toBe(reference(values, 50));
      expect(s.p95).toBe(reference(values, 95));
      expect(s.p99).toBe(reference(values, 99));
      expect(s.max).toBe(Math.max(...values));
      expect(s.histogram.reduce((a, b) => a + b.count, 0)).toBe(n);
    }
  });

  it('empty figures have no percentiles', () => {
    const s = statsOf([]);
    expect(s).toMatchObject({ count: 0, p50: null, p95: null, p99: null, max: null });
    expect(s.histogram.every((b) => b.count === 0)).toBe(true);
  });

  it('histogram bounds are log-spaced from 1 ms to 60 s and catch everything above', () => {
    expect(HISTOGRAM_BOUNDS[0]).toBe(1);
    expect(HISTOGRAM_BOUNDS.at(-1)).toBe(Infinity);
    expect(HISTOGRAM_BOUNDS.at(-2)!).toBeGreaterThanOrEqual(60_000);
    const s = statsOf([0.5, 1, 1.1, 120_000]);
    expect(s.histogram[0].count).toBe(2);
    expect(s.histogram.at(-1)!.count).toBe(1);
  });

  it('builds a per-second series of submissions, completions and percentiles', () => {
    const stats = new RunStats(1000);
    stats.recordSubmitted(1100);
    stats.recordSubmitted(1900);
    stats.recordSubmitted(2100);
    stats.recordFigure('toFilled', 30, 1500);
    stats.recordFigure('toFilled', 50, 1600);
    stats.recordCompleted(1600);
    const series = stats.series(3000);
    expect(series.map((p) => p.t)).toEqual([0, 1, 2]);
    expect(series[0]).toMatchObject({ t: 0, submitted: 2, completed: 1 });
    expect(series[0].p.toFilled).toEqual({ p50: 30, p95: 50, p99: 50 });
    expect(series[1]).toMatchObject({ t: 1, submitted: 1, completed: 0 });
    expect(series[1].p.toFilled).toBeUndefined();
    expect(Object.keys(stats.figureStats())).toEqual([...FIGURES]);
    expect(stats.figureStats().toFilled.count).toBe(2);
  });
});
