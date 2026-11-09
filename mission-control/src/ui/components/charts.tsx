import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FIGURE_LABELS, type Figure, type FigureStats, type SeriesPoint } from '../../shared/types';
import { fmtMs } from '../api';

const INITIAL = { width: 560, height: 220 };
const AXIS = { stroke: '#94a3b8', fontSize: 11 };
const GRID = '#334155';
export const COLORS = { p50: '#38bdf8', p95: '#f59e0b', p99: '#f43f5e', submitted: '#38bdf8', completed: '#22c55e' };

function Panel({ title, testId, children, readout }: { title: string; testId: string; children: React.ReactNode; readout?: React.ReactNode }) {
  return (
    <section data-testid={testId} className="rounded-lg border border-slate-800 bg-slate-900 p-3">
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-slate-200">{title}</h3>
        {readout && <div className="text-xs text-slate-400">{readout}</div>}
      </header>
      <div className="h-[220px] w-full">{children}</div>
    </section>
  );
}

/** Submitted and completed orders per second. */
export function ThroughputChart({ series }: { series: SeriesPoint[] }) {
  const last = series.at(-2) ?? series.at(-1);
  return (
    <Panel
      title="Throughput (orders/s)"
      testId="throughput"
      readout={last ? <span>submitted {last.submitted}/s · completed {last.completed}/s</span> : null}
    >
      <ResponsiveContainer initialDimension={INITIAL}>
        <LineChart data={series}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
          <XAxis dataKey="t" tick={AXIS} unit="s" />
          <YAxis tick={AXIS} allowDecimals={false} />
          <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
          <Legend />
          <Line type="monotone" dataKey="submitted" stroke={COLORS.submitted} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="completed" stroke={COLORS.completed} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </Panel>
  );
}

/** p50/p95/p99 of one figure, per second of the run. */
export function LatencyChart({ figure, series, stats }: { figure: Figure; series: SeriesPoint[]; stats?: FigureStats }) {
  const data = series.map((p) => ({ t: p.t, ...p.p[figure] }));
  return (
    <Panel
      title={FIGURE_LABELS[figure]}
      testId={`latency-${figure}`}
      readout={stats ? <span>p50 {fmtMs(stats.p50)} · p95 {fmtMs(stats.p95)} · p99 {fmtMs(stats.p99)} · n={stats.count}</span> : null}
    >
      <ResponsiveContainer initialDimension={INITIAL}>
        <LineChart data={data}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
          <XAxis dataKey="t" tick={AXIS} unit="s" />
          <YAxis tick={AXIS} unit="ms" />
          <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} formatter={(v: number) => fmtMs(v)} />
          <Legend />
          {(['p50', 'p95', 'p99'] as const).map((k) => (
            <Line key={k} type="monotone" dataKey={k} stroke={COLORS[k]} dot={false} connectNulls isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Panel>
  );
}

/** Orders by their latest state. */
export function StateBars({ counts }: { counts: Record<string, number> }) {
  const data = Object.entries(counts).map(([state, count]) => ({ state, count }));
  return (
    <Panel
      title="Orders by state"
      testId="states"
      readout={
        <span>
          {data.map((d) => (
            <span key={d.state} className="ml-2">
              {d.state} {d.count}
            </span>
          ))}
        </span>
      }
    >
      <ResponsiveContainer initialDimension={INITIAL}>
        <BarChart data={data}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
          <XAxis dataKey="state" tick={AXIS} />
          <YAxis tick={AXIS} allowDecimals={false} />
          <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
          <Bar dataKey="count" fill="#38bdf8" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </Panel>
  );
}

/** Distribution of one figure over the log-spaced buckets, trimmed to the occupied range. */
export function Histogram({ title, stats, testId }: { title: string; stats: FigureStats; testId: string }) {
  const first = stats.histogram.findIndex((b) => b.count > 0);
  const last = stats.histogram.length - 1 - [...stats.histogram].reverse().findIndex((b) => b.count > 0);
  const data = first < 0 ? [] : stats.histogram.slice(first, last + 1).map((b) => ({ le: b.le === null ? '+Inf' : fmtMs(b.le), count: b.count }));
  return (
    <Panel title={title} testId={testId} readout={<span>n={stats.count}</span>}>
      <ResponsiveContainer initialDimension={INITIAL}>
        <BarChart data={data}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
          <XAxis dataKey="le" tick={AXIS} interval="preserveStartEnd" />
          <YAxis tick={AXIS} allowDecimals={false} />
          <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
          <Bar dataKey="count" fill="#a78bfa" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </Panel>
  );
}
