import React from 'react';
import type { PanelUnit } from '@shared/projectConfig';
import type { ServiceStatus } from '@shared/types/monitor';

/** Tailwind classes per status, shared by the badge, the strip and the timeline. */
export const STATUS_TONE: Record<ServiceStatus, { dot: string; badge: string; cell: string }> = {
  UP: {
    dot: 'bg-green-500',
    badge: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
    cell: 'bg-green-500/80',
  },
  DOWN: {
    dot: 'bg-red-500',
    badge: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
    cell: 'bg-red-500/80',
  },
  UNKNOWN: {
    dot: 'bg-amber-500',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    cell: 'bg-amber-500/80',
  },
};

/** A value in its unit, compact enough for a tile: `1.2k`, `340 ms`, `1.25 s`, `12.5%`, `3.4 MB`, `60 /min`. */
export function formatValue(value: number | null | undefined, unit: PanelUnit): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const round = (v: number, digits = 2) => Number(v.toFixed(digits)).toString();
  switch (unit) {
    case 'ms':
      return value >= 1000 ? `${round(value / 1000)} s` : `${round(value, 1)} ms`;
    case 's':
      return value < 1 ? `${round(value * 1000, 1)} ms` : `${round(value)} s`;
    case 'percent':
      return `${round(value, 1)}%`;
    case 'bytes': {
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      let v = value;
      let i = 0;
      while (Math.abs(v) >= 1024 && i < units.length - 1) {
        v /= 1024;
        i++;
      }
      return `${round(v, 1)} ${units[i]}`;
    }
    case 'perMinute':
      return `${round(value, 1)} /min`;
    default:
      return Math.abs(value) >= 10_000 ? `${round(value / 1000, 1)}k` : round(value);
  }
}

/** Polyline points scaled into a `width`×`height` box; a single value is a flat line. */
export function sparkPoints(values: number[], width: number, height: number): string {
  if (!values.length) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const x = values.length > 1 ? i * step : width / 2;
      const y = max === min ? height / 2 : height - ((v - min) / span) * height;
      return `${round1(x)},${round1(y)}`;
    })
    .join(' ');
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** A small line chart without axes: response times on a tile, a timeseries panel. */
export function Sparkline({ values, width = 120, height = 28, label, testId }: { values: number[]; width?: number; height?: number; label: string; testId?: string }) {
  if (values.length < 2) {
    return (
      <div className="flex items-center text-[10px] text-muted-foreground" style={{ width, height }} data-testid={testId}>
        collecting…
      </div>
    );
  }
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} data-testid={testId} className="overflow-visible">
      <polyline points={sparkPoints(values, width, height)} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" className="text-primary" />
    </svg>
  );
}

/** One cell per check, oldest first, coloured by status. */
export function HistoryStrip({ statuses, label }: { statuses: { status: ServiceStatus; at: number }[]; label: string }) {
  return (
    <div className="flex h-3 gap-px" role="img" aria-label={label} data-testid="history-strip">
      {statuses.map((s, i) => (
        <span
          key={`${s.at}-${i}`}
          className={`h-3 w-1.5 rounded-[1px] ${STATUS_TONE[s.status].cell}`}
          title={`${s.status} · ${new Date(s.at).toLocaleTimeString()}`}
          data-status={s.status}
        />
      ))}
    </div>
  );
}

/** Horizontal bars, longest first as given; each bar relative to the largest value. */
export function Bars({ bars, unit }: { bars: { label: string; value: number }[]; unit: PanelUnit }) {
  const max = Math.max(...bars.map((b) => b.value), 0) || 1;
  return (
    <div className="space-y-1.5">
      {bars.map((b) => (
        <div key={b.label} className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-2 text-xs" data-testid="panel-bar">
          <span className="truncate text-muted-foreground" title={b.label}>
            {b.label}
          </span>
          <span className="h-2 rounded-full bg-muted">
            <span className="block h-2 rounded-full bg-primary" style={{ width: `${Math.max(2, (b.value / max) * 100)}%` }} />
          </span>
          <span className="tabular-nums">{formatValue(b.value, unit)}</span>
        </div>
      ))}
    </div>
  );
}
