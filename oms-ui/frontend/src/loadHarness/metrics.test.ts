import { Histogram, heapMinimumPerMinute, longTasksOver, buildReport } from './metrics';

// SPEC-0057 AC-9 and AC-10 are measured in Chrome with the load harness; these tests prove that the
// harness turns its raw samples into the numbers the budgets are judged on correctly.

describe('Histogram', () => {
  it('gives percentiles and the maximum at 1 ms resolution', () => {
    const h = new Histogram(1000);
    for (let ms = 1; ms <= 100; ms++) {
      h.record(ms);
    }

    expect(h.count).toBe(100);
    expect(h.percentile(50)).toBe(50);
    expect(h.percentile(95)).toBe(95);
    expect(h.percentile(99)).toBe(99);
    expect(h.max).toBe(100);
  });

  it('counts values beyond its range at the top without losing the maximum', () => {
    const h = new Histogram(10);
    h.record(3);
    h.record(5000);

    expect(h.percentile(99)).toBeGreaterThan(10);
    expect(h.max).toBe(5000);
  });

  it('is zero when empty', () => {
    expect(new Histogram(10).percentile(99)).toBe(0);
  });
});

describe('longTasksOver', () => {
  it('keeps long tasks above the threshold that start after the warm-up', () => {
    const tasks = [
      { startTime: 500, duration: 400 }, // warm-up
      { startTime: 1500, duration: 200 }, // short enough
      { startTime: 2000, duration: 300 },
    ];

    expect(longTasksOver(tasks, 250, 1000)).toEqual([{ startTime: 2000, duration: 300 }]);
  });
});

describe('heapMinimumPerMinute', () => {
  it('takes the lowest sample of each minute, which is the heap after garbage collection', () => {
    const samples = [
      { t: 0, bytes: 50 }, { t: 30_000, bytes: 40 }, { t: 59_999, bytes: 60 },
      { t: 60_000, bytes: 45 }, { t: 90_000, bytes: 70 },
      { t: 120_000, bytes: 48 },
    ];

    expect(heapMinimumPerMinute(samples)).toEqual([40, 45, 48]);
  });
});

describe('buildReport', () => {
  const lag = new Histogram(10_000);
  const frames = new Histogram(1000);
  [5, 10, 20].forEach(ms => lag.record(ms));
  [16, 17, 33].forEach(ms => frames.record(ms));
  const base = {
    params: { domain: 'Order', rate: 2000, duration: 60, keys: 10_000, maxRows: 2000 },
    sent: 120_000,
    applied: 120_000,
    lag,
    frames,
    longTasks: [],
    heapSamples: [],
  };

  it('passes AC-9 when every budget is met', () => {
    const report = buildReport(base);

    expect(report.ac9.pass).toBe(true);
    expect(report.lagMs).toEqual({ p50: 10, p99: 20, max: 20 });
    expect(report.frameMs.p95).toBe(33);
  });

  it('fails AC-9 when an event was not applied, or a budget is missed', () => {
    expect(buildReport({ ...base, applied: 119_999 }).ac9.pass).toBe(false);
    expect(buildReport({ ...base, longTasks: [{ startTime: 5000, duration: 300 }] }).ac9.pass).toBe(false);
    const slow = new Histogram(1000);
    slow.record(80);
    expect(buildReport({ ...base, frames: slow }).ac9.pass).toBe(false);
  });

  it('judges AC-10 on the heap minimum of the last minute against the second', () => {
    const minute = (m: number, bytes: number) => ({ t: m * 60_000 + 1, bytes });
    const flat = { ...base, params: { ...base.params, duration: 600 }, heapSamples: [minute(0, 80), minute(1, 100), minute(9, 109)] };
    const growing = { ...flat, heapSamples: [minute(0, 80), minute(1, 100), minute(9, 111)] };

    expect(buildReport(flat).ac10).toEqual({ pass: true, minute2: 100, last: 109, growthPct: 9 });
    expect(buildReport(growing).ac10.pass).toBe(false);
  });

  // A 10-minute run's last minute is its tenth: samples taken after the run (while the harness
  // waits for the grid to catch up) are not part of it.
  it('ignores heap samples taken after the run', () => {
    const minute = (m: number, bytes: number) => ({ t: m * 60_000 + 1, bytes });
    const report = buildReport({
      ...base,
      params: { ...base.params, duration: 600 },
      heapSamples: [minute(1, 100), minute(9, 150), minute(10, 90)],
    });

    expect(report.ac10).toEqual({ pass: false, minute2: 100, last: 150, growthPct: 50 });
  });

  // Chrome stops animating a hidden or covered page; what such a run measures is the throttling.
  it('judges nothing when the page was hidden during the run', () => {
    const minute = (m: number, bytes: number) => ({ t: m * 60_000 + 1, bytes });
    const report = buildReport({
      ...base,
      params: { ...base.params, duration: 600 },
      heapSamples: [minute(1, 100), minute(9, 101)],
      hiddenMs: 73_000,
    });

    expect(report.valid).toBe(false);
    expect(report.hiddenMs).toBe(73_000);
    expect(report.ac9.pass).toBeNull();
    expect(report.ac10.pass).toBeNull();
  });

  it('is valid when the page stayed visible', () => {
    expect(buildReport({ ...base, hiddenMs: 0 }).valid).toBe(true);
    expect(buildReport(base).valid).toBe(true);
  });

  it('cannot judge AC-10 without heap samples (a browser without performance.memory)', () => {
    expect(buildReport(base).ac10.pass).toBeNull();
  });
});
