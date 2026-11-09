import { FIGURES, type Snapshot } from '../../shared/types';
import { LatencyChart, StateBars, ThroughputChart } from '../components/charts';

/** The running run: progress, throughput, latency per figure over time, orders by state (AC-4). */
export function LiveRun({ snapshot, onStop }: { snapshot: Snapshot; onStop?: () => void }) {
  const s = snapshot.summary;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <h2 className="text-lg font-semibold">
          Run {s.runId} <span className="rounded bg-sky-900 px-2 py-0.5 text-xs">{s.status}</span>
        </h2>
        <span data-testid="progress" className="text-sm text-slate-300">
          sent {s.sent} / {s.scheduled} · created {s.created} · errors {s.createErrors.length} · target {s.targetRate}/s · achieved {s.achievedRate ?? '–'}/s
        </span>
        {onStop && (s.status === 'RUNNING' || s.status === 'DRAINING') && (
          <button onClick={onStop} className="rounded bg-rose-700 px-3 py-1 text-sm hover:bg-rose-600">
            Stop
          </button>
        )}
      </div>
      {s.generatorLimited && <GeneratorLimitedBanner />}
      <div className="grid gap-4 lg:grid-cols-2">
        <ThroughputChart series={snapshot.series} />
        <StateBars counts={s.stateCounts} />
        {FIGURES.map((f) => (
          <LatencyChart key={f} figure={f} series={snapshot.series} stats={s.figures[f]} />
        ))}
      </div>
    </div>
  );
}

export function GeneratorLimitedBanner() {
  return (
    <div role="alert" className="rounded border border-amber-600 bg-amber-950 p-2 text-sm text-amber-200">
      Generator-limited: Mission Control could not keep the target rate (achieved &lt; 95 % or p99 send lateness &gt; 50 ms). These numbers describe Mission Control, not OMS.
    </div>
  );
}
