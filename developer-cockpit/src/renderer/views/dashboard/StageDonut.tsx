import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import type { SpecTicketStatus, SpecTicketSummary } from '@shared/types/specTickets';
import { stageDistribution, type StageShare } from '@/lib/spec-tickets';
import { useSpecTicketsStore } from '@/stores/specTickets';

const pct = (p: number) => `${Math.round(p)}%`;

const C = 100;
const R_OUT = 92;
const R_IN = 62;
const POP = 6;

/**
 * Toggles the ticket table's stage filter. The overview counts everyone's tickets, so filtering
 * from it also switches the table to everyone's.
 */
export function toggleStage(stage: SpecTicketStatus) {
  const { stage: current, setFilter } = useSpecTicketsStore.getState();
  setFilter(current === stage ? { stage: '' } : { stage, mineOnly: false });
}

/** Point on a circle around the centre; 0° is 12 o'clock, angles grow clockwise. */
function point(r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(rad), C + r * Math.sin(rad)];
}

function sectorPath(start: number, sweep: number): string {
  if (sweep >= 360) {
    // An SVG arc cannot span exactly 360°, so a full ring is two half arcs per circle.
    const ring = (r: number) => {
      const [x0, y0] = point(r, 0);
      const [x1, y1] = point(r, 180);
      return `M${x0} ${y0} A${r} ${r} 0 1 1 ${x1} ${y1} A${r} ${r} 0 1 1 ${x0} ${y0} Z`;
    };
    return `${ring(R_OUT)} ${ring(R_IN)}`;
  }
  const end = start + sweep;
  const large = sweep > 180 ? 1 : 0;
  const [ox0, oy0] = point(R_OUT, start);
  const [ox1, oy1] = point(R_OUT, end);
  const [ix1, iy1] = point(R_IN, end);
  const [ix0, iy0] = point(R_IN, start);
  return `M${ox0} ${oy0} A${R_OUT} ${R_OUT} 0 ${large} 1 ${ox1} ${oy1} L${ix1} ${iy1} A${R_IN} ${R_IN} 0 ${large} 0 ${ix0} ${iy0} Z`;
}

interface Segment extends StageShare {
  start: number;
  sweep: number;
}

/**
 * Donut of the active tickets per stage in pipeline order, with the total in the hole and a legend
 * that doubles as the table view. Segments and legend entries toggle the ticket table's stage
 * filter. Colours come from the --stage-* tokens in globals.css.
 */
export function StageDonut({ tickets }: { tickets: SpecTicketSummary[] }) {
  const { total, shares } = stageDistribution(tickets);
  const filter = useSpecTicketsStore((s) => s.stage);
  const [hovered, setHovered] = useState<SpecTicketStatus | null>(null);

  if (!total) return <p className="text-sm text-muted-foreground">No active tickets yet.</p>;

  let start = 0;
  const segments: Segment[] = shares.map((s) => {
    const seg = { ...s, start, sweep: (360 * s.count) / total };
    start += seg.sweep;
    return seg;
  });
  const describe = shares.map((s) => `${s.stage} ${s.count} (${pct(s.pct)})`).join(', ');
  const active = segments.find((s) => s.stage === hovered);
  const onKey = (stage: SpecTicketStatus) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleStage(stage);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-6">
        <div className="relative h-44 w-44 shrink-0">
          <svg
            viewBox="0 0 200 200"
            role="group"
            aria-label={`Ticket progress of ${total} active tickets: ${describe}`}
            className="h-full w-full overflow-visible"
          >
            {segments.map((s) => {
              const lift = s.stage === hovered && s.sweep < 360 ? point(POP, s.start + s.sweep / 2) : [C, C];
              return (
                <path
                  key={s.stage}
                  data-testid="stage-segment"
                  data-stage={s.stage}
                  data-sweep={s.sweep}
                  d={sectorPath(s.start, s.sweep)}
                  fill={`var(--stage-${s.stage})`}
                  fillRule="evenodd"
                  stroke="var(--color-card)"
                  strokeWidth={2}
                  transform={`translate(${lift[0] - C} ${lift[1] - C})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${s.stage}: ${s.count} of ${total} (${pct(s.pct)})`}
                  aria-pressed={filter === s.stage}
                  className="cursor-pointer outline-none transition-transform focus-visible:opacity-80"
                  onMouseEnter={() => setHovered(s.stage)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(s.stage)}
                  onBlur={() => setHovered(null)}
                  onClick={() => toggleStage(s.stage)}
                  onKeyDown={onKey(s.stage)}
                />
              );
            })}
          </svg>
          {/* The hole shows the total, or the hovered or focused segment in its place. */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            {active ? (
              <div role="tooltip">
                <div className="text-sm font-semibold text-foreground">{active.stage}</div>
                <div className="text-xs tabular-nums text-muted-foreground">{active.count} of {total} · {pct(active.pct)}</div>
              </div>
            ) : (
              <>
                <span data-testid="donut-total" className="text-3xl font-semibold tabular-nums text-foreground">{total}</span>
                <span className="text-xs text-muted-foreground">active tickets</span>
              </>
            )}
          </div>
        </div>

        <ul aria-label="Stage legend" className="min-w-0 flex-1 space-y-0.5 text-sm">
          {shares.map((s) => (
            <li key={s.stage}>
              <button
                aria-pressed={filter === s.stage}
                onClick={() => toggleStage(s.stage)}
                onMouseEnter={() => setHovered(s.stage)}
                onMouseLeave={() => setHovered(null)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-accent ${filter === s.stage ? 'bg-accent' : ''}`}
              >
                <span aria-hidden className="h-3 w-3 shrink-0 rounded-sm" style={{ background: `var(--stage-${s.stage})` }} />
                {s.stage === 'blocked' && <AlertTriangle aria-hidden data-icon="blocked" className="h-3.5 w-3.5 text-destructive" />}
                <span className="text-foreground">{s.stage}</span>{' '}
                <span className="ml-auto tabular-nums text-muted-foreground">{s.count} · {pct(s.pct)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {filter && (
        <div data-testid="stage-filter-chip" className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
          <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: `var(--stage-${filter})` }} />
          <span>Showing: <span className="font-medium">{filter}</span></span>
          <button
            aria-label="Clear stage filter"
            className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground"
            onClick={() => useSpecTicketsStore.getState().setFilter({ stage: '' })}
          >
            <X aria-hidden className="h-3 w-3" /> Clear
          </button>
        </div>
      )}
    </div>
  );
}
