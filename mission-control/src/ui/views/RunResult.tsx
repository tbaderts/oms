import { FIGURES, FIGURE_LABELS } from '../../shared/types';
import type { RunDetail } from '../api';
import { Histogram, StateBars, ThroughputChart } from '../components/charts';
import { FigureTable } from '../components/FigureTable';
import { GeneratorLimitedBanner } from './LiveRun';

/** A finished run: figure table, histograms, errors, rejects and incomplete orders (AC-4, AC-5). */
export function RunResult({ run }: { run: RunDetail }) {
  const s = run.summary;
  const duration = s.endedAt ? ((s.endedAt - s.startedAt) / 1000).toFixed(1) : '–';
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-4">
        <h2 className="text-lg font-semibold">
          Run {s.runId} {s.label && <span className="text-slate-400">— {s.label}</span>} <span className="rounded bg-slate-700 px-2 py-0.5 text-xs">{s.status}</span>
        </h2>
        <span className="text-sm text-slate-300" data-testid="result-header">
          {run.config.rate}/s × {run.config.durationSec} s · {run.config.template.ordType} {run.config.template.side} {run.config.template.symbol} · sent {s.sent} · created {s.created} · achieved {s.achievedRate ?? '–'}/s · {duration} s
        </span>
      </div>
      {s.generatorLimited && <GeneratorLimitedBanner />}
      <section className="rounded-lg border border-slate-800 bg-slate-900 p-3">
        <FigureTable summary={s} />
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <ThroughputChart series={run.series} />
        <StateBars counts={s.stateCounts} />
        {FIGURES.map((f) => (
          <Histogram key={f} title={`${FIGURE_LABELS[f]} — distribution`} stats={s.figures[f]} testId={`histogram-${f}`} />
        ))}
      </div>
      <Problems
        title={`Create errors (${s.createErrors.length})`}
        testId="create-errors"
        rows={s.createErrors.map((e) => [e.clOrdId, e.status === null ? 'no response' : `HTTP ${e.status}`, e.message + (e.body ? ` — ${e.body}` : '')])}
      />
      <Problems title={`Rejected by the venue (${s.rejected.length})`} testId="rejected" rows={s.rejected.map((r) => [r.clOrdId, r.orderId ?? '', r.reason ?? ''])} />
      <Problems title={`Incomplete orders (${s.incomplete.length})`} testId="incomplete" rows={s.incomplete.map((r) => [r.clOrdId, r.orderId ?? '', `last state ${r.lastState ?? 'none'}`])} />
      {s.decodeErrors > 0 && <p className="text-sm text-amber-300">{s.decodeErrors} Kafka records could not be decoded.</p>}
    </div>
  );
}

function Problems({ title, rows, testId }: { title: string; rows: string[][]; testId: string }) {
  return (
    <section data-testid={testId} className="rounded-lg border border-slate-800 bg-slate-900 p-3">
      <h3 className="mb-1 text-sm font-medium">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">None.</p>
      ) : (
        <ul className="max-h-48 overflow-auto font-mono text-xs">
          {rows.map((r) => (
            <li key={r[0]}>{r.join(' · ')}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
