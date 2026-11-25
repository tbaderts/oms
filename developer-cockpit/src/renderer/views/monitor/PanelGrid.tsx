import React from 'react';
import type { PanelView } from '@/stores/monitor';
import { Bars, formatValue, Sparkline } from './charts';

function PanelBody({ panel }: { panel: PanelView }) {
  if (!panel.ok) {
    return (
      <div className="text-xs text-destructive" data-testid="panel-error">
        {panel.error}
      </div>
    );
  }
  if (panel.type === 'bars') {
    const bars = panel.bars ?? [];
    return bars.length ? <Bars bars={bars} unit={panel.unit} /> : <div className="text-xs text-muted-foreground">no data</div>;
  }
  if (panel.type === 'timeseries') {
    const points = panel.series ?? [];
    const latest = points.length ? points[points.length - 1].value : null;
    return (
      <div className="space-y-1">
        <div className="text-2xl font-semibold tabular-nums" data-testid="panel-value">
          {formatValue(latest, panel.unit)}
        </div>
        <Sparkline values={points.map((p) => p.value)} width={260} height={48} label={`${panel.title} over time`} testId="panel-series" />
      </div>
    );
  }
  return (
    <div className="text-3xl font-semibold tabular-nums" data-testid="panel-value">
      {panel.value === null || panel.value === undefined ? <span className="text-base text-muted-foreground">no data</span> : formatValue(panel.value, panel.unit)}
    </div>
  );
}

/** The configured metric panels: a big number, bars per label, or a line over time. */
export function PanelGrid({ panels }: { panels: PanelView[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {panels.map((p, i) => (
        <div key={`${p.title}-${i}`} className="rounded-lg border bg-card p-4" data-testid="panel" data-panel={p.title} data-ok={p.ok}>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{p.title}</div>
          <PanelBody panel={p} />
        </div>
      ))}
    </div>
  );
}
