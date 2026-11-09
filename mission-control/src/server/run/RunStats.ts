import { FIGURES, type Figure, type FigureStats, type SeriesPoint } from '../../shared/types.js';

/** Display buckets: 1 ms × 2^(k/4) up to the first bound ≥ 60 s, then +Inf. */
export const HISTOGRAM_BOUNDS: readonly number[] = (() => {
  const b: number[] = [];
  for (let k = 0; ; k++) {
    const v = Math.round(2 ** (k / 4) * 1000) / 1000;
    b.push(v);
    if (v >= 60_000) break;
  }
  b.push(Infinity);
  return b;
})();

/** Nearest-rank percentile of an ascending array (exact, no interpolation). */
export function nearestRank(sorted: readonly number[], p: number): number {
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

export function statsOf(values: readonly number[]): FigureStats {
  const sorted = [...values].sort((a, b) => a - b);
  const counts = new Array<number>(HISTOGRAM_BOUNDS.length).fill(0);
  let i = 0;
  for (const v of sorted) {
    while (v > HISTOGRAM_BOUNDS[i]) i++;
    counts[i]++;
  }
  const histogram = HISTOGRAM_BOUNDS.map((le, k) => ({ le: Number.isFinite(le) ? le : null, count: counts[k] }));
  if (sorted.length === 0) return { count: 0, p50: null, p95: null, p99: null, max: null, histogram };
  return {
    count: sorted.length,
    p50: nearestRank(sorted, 50),
    p95: nearestRank(sorted, 95),
    p99: nearestRank(sorted, 99),
    max: sorted[sorted.length - 1],
    histogram,
  };
}

interface Bucket {
  submitted: number;
  completed: number;
  values: Partial<Record<Figure, number[]>>;
}

/**
 * Counts and figure samples of one run. Percentiles are exact over every sample (design D5);
 * the series has one point per second since the run started.
 */
export class RunStats {
  private readonly all: Record<Figure, number[]> = Object.fromEntries(FIGURES.map((f) => [f, []])) as unknown as Record<Figure, number[]>;
  private readonly buckets = new Map<number, Bucket>();

  constructor(private readonly startedAt: number) {}

  recordSubmitted(at: number): void {
    this.bucket(at).submitted++;
  }

  recordCompleted(at: number): void {
    this.bucket(at).completed++;
  }

  recordFigure(figure: Figure, value: number, at: number): void {
    this.all[figure].push(value);
    const b = this.bucket(at);
    (b.values[figure] ??= []).push(value);
  }

  figureStats(): Record<Figure, FigureStats> {
    return Object.fromEntries(FIGURES.map((f) => [f, statsOf(this.all[f])])) as Record<Figure, FigureStats>;
  }

  /** Points for every second from the start up to and including the (partial) second holding `now`. */
  series(now: number): SeriesPoint[] {
    const last = Math.max(0, Math.floor((now - this.startedAt) / 1000));
    const points: SeriesPoint[] = [];
    for (let t = 0; t <= last; t++) {
      const b = this.buckets.get(t);
      const p: SeriesPoint['p'] = {};
      for (const f of FIGURES) {
        const v = b?.values[f];
        if (v && v.length) {
          const s = [...v].sort((x, y) => x - y);
          p[f] = { p50: nearestRank(s, 50), p95: nearestRank(s, 95), p99: nearestRank(s, 99) };
        }
      }
      points.push({ t, submitted: b?.submitted ?? 0, completed: b?.completed ?? 0, p });
    }
    return points;
  }

  private bucket(at: number): Bucket {
    const t = Math.max(0, Math.floor((at - this.startedAt) / 1000));
    let b = this.buckets.get(t);
    if (!b) {
      b = { submitted: 0, completed: 0, values: {} };
      this.buckets.set(t, b);
    }
    return b;
  }
}
