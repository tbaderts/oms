/**
 * Measurement for the load harness (SPEC-0057 AC-9, AC-10): turns raw samples into the numbers the
 * proposal's budgets are judged on.
 */

/** Millisecond histogram at 1 ms resolution up to `maxMs`; larger values share one top bucket. */
export class Histogram {
  private readonly buckets: Uint32Array;
  private total = 0;
  private largest = 0;

  constructor(private readonly maxMs: number) {
    this.buckets = new Uint32Array(maxMs + 2);
  }

  record(ms: number): void {
    const value = Math.max(0, ms);
    this.buckets[Math.min(Math.round(value), this.maxMs + 1)]++;
    this.total++;
    this.largest = Math.max(this.largest, value);
  }

  get count(): number {
    return this.total;
  }

  get max(): number {
    return Math.round(this.largest);
  }

  /** The smallest value at or below which `p` percent of the samples fall (nearest rank). */
  percentile(p: number): number {
    if (this.total === 0) {
      return 0;
    }
    const rank = Math.ceil((p / 100) * this.total);
    let seen = 0;
    for (let ms = 0; ms < this.buckets.length; ms++) {
      seen += this.buckets[ms];
      if (seen >= rank) {
        return ms > this.maxMs ? this.max : ms;
      }
    }
    return this.max;
  }
}

export interface LongTask {
  startTime: number;
  duration: number;
}

/** Long tasks longer than `thresholdMs` that started at or after `afterMs` (the warm-up excluded). */
export function longTasksOver(tasks: LongTask[], thresholdMs: number, afterMs: number): LongTask[] {
  return tasks.filter(task => task.duration > thresholdMs && task.startTime >= afterMs);
}

export interface HeapSample {
  /** Milliseconds since the run started. */
  t: number;
  bytes: number;
}

/**
 * The lowest heap sample of each minute of the run. Samples between collections include garbage;
 * the minimum approximates the live heap after a collection. A minute without samples is NaN.
 */
export function heapMinimumPerMinute(samples: HeapSample[]): number[] {
  const minima: number[] = [];
  samples.forEach(({ t, bytes }) => {
    const minute = Math.floor(t / 60_000);
    while (minima.length <= minute) {
      minima.push(Infinity);
    }
    minima[minute] = Math.min(minima[minute], bytes);
  });
  return minima.map(value => (value === Infinity ? NaN : value));
}

export interface LoadParams {
  domain: string;
  rate: number;
  duration: number;
  keys: number;
  maxRows: number;
}

export interface LoadInput {
  params: LoadParams;
  sent: number;
  applied: number;
  lag: Histogram;
  frames: Histogram;
  longTasks: LongTask[];
  heapSamples: HeapSample[];
  /** Time the page was hidden during the run (visibilitychange). */
  hiddenMs?: number;
  /** Time without frames (gaps over 1 s) while no long task ran: Chrome throttling the page. */
  stalledMs?: number;
}

/** Budgets from proposal.md (AC-9, AC-10). */
export const BUDGETS = {
  lagP99Ms: 1000,
  frameP95Ms: 50,
  longTaskMs: 250,
  warmUpMs: 1000,
  heapGrowth: 0.1,
};

export function buildReport(input: LoadInput) {
  const { params, sent, applied, lag, frames, longTasks } = input;
  const hiddenMs = input.hiddenMs ?? 0;
  const stalledMs = input.stalledMs ?? 0;
  // A hidden or throttled page measures Chrome, not the blotter: such a run judges nothing.
  const valid = hiddenMs === 0 && stalledMs === 0;
  // Only samples within the run: the harness keeps sampling while the grid catches up after it.
  const heapSamples = input.heapSamples.filter(sample => sample.t < params.duration * 1000);
  const lagMs = { p50: lag.percentile(50), p99: lag.percentile(99), max: lag.max };
  const frameMs = { p50: frames.percentile(50), p95: frames.percentile(95), max: frames.max };
  const overBudget = longTasksOver(longTasks, BUDGETS.longTaskMs, BUDGETS.warmUpMs);

  const minima = heapMinimumPerMinute(heapSamples);
  const minute2 = minima.length >= 2 && !Number.isNaN(minima[1]) ? minima[1] : null;
  const last = minima.length >= 2 && !Number.isNaN(minima[minima.length - 1]) ? minima[minima.length - 1] : null;
  const ac10 = minute2 === null || last === null
    ? { pass: null as boolean | null, minute2: null as number | null, last: null as number | null, growthPct: null as number | null }
    : {
        pass: (valid ? last <= minute2 * (1 + BUDGETS.heapGrowth) : null) as boolean | null,
        minute2,
        last,
        growthPct: Math.round((last / minute2 - 1) * 100),
      };

  return {
    params,
    valid,
    hiddenMs,
    stalledMs,
    sent,
    applied,
    lagMs,
    frameMs,
    longTasksOverBudget: overBudget,
    heapMinimumPerMinuteMB: minima.map(bytes => Math.round((bytes / 1_048_576) * 10) / 10),
    ac9: {
      pass: !valid ? null : applied === sent
        && lagMs.p99 <= BUDGETS.lagP99Ms
        && frameMs.p95 <= BUDGETS.frameP95Ms
        && overBudget.length === 0,
    },
    ac10,
  };
}

export type LoadReport = ReturnType<typeof buildReport>;
