import { statsOf } from '../../src/server/run/RunStats';
import { runConfig, type RunSummary, type SeriesPoint } from '../../src/shared/types';
import type { RunDetail } from '../../src/ui/api';

export function summary(over: Partial<RunSummary> = {}): RunSummary {
  const filled = statsOf([12, 30, 45, 80, 2100]);
  const empty = statsOf([]);
  return {
    runId: '20261108-180000-ab12',
    status: 'RUNNING',
    startedAt: 1000,
    targetRate: 20,
    achievedRate: 19.98,
    p99LatenessMs: 3,
    generatorLimited: false,
    scheduled: 1200,
    sent: 400,
    created: 398,
    createErrors: [],
    rejected: [],
    incomplete: [],
    stateCounts: { FILLED: 390, LIVE: 5, UNACK: 3 },
    decodeErrors: 0,
    figures: { toOmsAck: statsOf([1, 2, 3]), toMarket: statsOf([5, 9]), toLive: filled, toFirstFill: filled, toFilled: filled },
    deltas: { omsAck: statsOf([0.5]), omsToMarket: empty, marketRoundTrip: empty },
    ...over,
  };
}

export const series: SeriesPoint[] = [
  { t: 0, submitted: 20, completed: 18, p: { toFilled: { p50: 30, p95: 80, p99: 90 } } },
  { t: 1, submitted: 20, completed: 21, p: { toFilled: { p50: 32, p95: 70, p99: 75 } } },
  { t: 2, submitted: 19, completed: 20, p: {} },
];

export function detail(over: Partial<RunSummary> = {}): RunDetail {
  return { config: runConfig.parse({ rate: 20, durationSec: 60 }), summary: summary({ status: 'COMPLETED', endedAt: 61_000, ...over }), series };
}
