import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { SpecTicketSummary } from '@shared/types/specTickets';
import { stageDistribution } from '@/lib/spec-tickets';

const pct = (p: number) => `${Math.round(p)}%`;

/**
 * Share of active tickets per stage as one 100% stacked bar in pipeline order, with a legend that
 * doubles as the table view. Colours come from the --stage-* tokens in globals.css.
 */
export function StageDistribution({ tickets }: { tickets: SpecTicketSummary[] }) {
  const { total, shares } = stageDistribution(tickets);
  if (!total) return <p className="text-sm text-muted-foreground">No active tickets yet.</p>;

  const describe = shares.map((s) => `${s.stage} ${s.count} (${pct(s.pct)})`).join(', ');

  return (
    <div className="space-y-2">
      <div
        role="img"
        aria-label={`Stage distribution of ${total} active tickets: ${describe}`}
        className="flex h-3 w-full gap-[2px]"
      >
        {shares.map((s) => (
          <div
            key={s.stage}
            data-testid="stage-segment"
            data-stage={s.stage}
            title={`${s.stage}: ${s.count} of ${total} (${pct(s.pct)})`}
            className="h-full min-w-[2px] first:rounded-l-[4px] last:rounded-r-[4px]"
            style={{ flexGrow: s.pct, flexBasis: 0, background: `var(--stage-${s.stage})` }}
          />
        ))}
      </div>
      <ul aria-label="Stage legend" className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {shares.map((s) => (
          <li key={s.stage} className="flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: `var(--stage-${s.stage})` }} />
            {s.stage === 'blocked' && <AlertTriangle aria-hidden className="h-3 w-3 text-destructive" />}
            <span className="text-foreground">{s.stage}</span>{' '}
            <span className="tabular-nums text-muted-foreground">{s.count} · {pct(s.pct)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
