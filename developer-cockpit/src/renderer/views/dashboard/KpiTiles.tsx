import React from 'react';
import { AlertTriangle, CheckCircle2, Hourglass, Layers, PlayCircle, type LucideIcon } from 'lucide-react';
import type { SpecTicketSummary } from '@shared/types/specTickets';
import { kpis, stageFilterLabel, type StageFilter } from '@/lib/spec-tickets';
import { useSpecTicketsStore } from '@/stores/specTickets';

interface TileProps {
  label: string;
  value: string;
  /** A --stage-* token; it marks the tile's identity (top band and icon), never its text. */
  accent: string;
  icon: LucideIcon;
  iconTag?: string;
  /** Stage view the tile filters the ticket table to, if it filters at all. */
  filterStage?: StageFilter;
  detail?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * Headline numbers of the active tickets. Values and labels stay in text tokens; each tile's
 * colour band and icon carry its identity. Every tile except Task completion toggles the stage
 * filter; the Active tickets tile clears it.
 */
export function KpiTiles({ tickets, unavailable }: { tickets: SpecTicketSummary[]; unavailable: boolean }) {
  const k = kpis(tickets);
  const n = (v: number) => (unavailable ? '–' : String(v));
  const completion = unavailable || k.completionPct === null ? '–' : `${k.completionPct}%`;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <Tile label="Active tickets" value={n(k.active)} accent="--stage-implement" icon={Layers} filterStage="" />
      <Tile label="In progress" value={n(k.inProgress)} accent="--stage-proposal" icon={PlayCircle} filterStage="in-progress" />
      <Tile label="Awaiting approval" value={n(k.awaiting)} accent="--stage-plan" icon={Hourglass} filterStage="awaiting" />
      <Tile label="Blocked" value={n(k.blocked)} accent="--stage-blocked" icon={AlertTriangle} iconTag="blocked" filterStage="blocked" />
      <Tile label="Done" value={n(k.done)} accent="--stage-done" icon={CheckCircle2} filterStage="done" />
      <Tile
        label="Task completion"
        value={completion}
        accent="--stage-design"
        icon={CheckCircle2}
        detail={unavailable ? null : `${k.tasksDone} of ${k.tasksTotal} tasks`}
      >
        <ProgressRing pct={unavailable ? null : k.completionPct} accent="--stage-design" />
      </Tile>
    </div>
  );
}

function Tile({ label, value, accent, icon: Icon, iconTag, filterStage, detail, children }: TileProps) {
  const stage = useSpecTicketsStore((s) => s.stage);
  const body = (
    <>
      <div className="flex h-7 items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {children ?? <Icon aria-hidden data-icon={iconTag} className="h-4 w-4 shrink-0" style={{ color: `var(${accent})` }} />}
      </div>
      <div data-testid="kpi-value" className="text-2xl font-semibold tabular-nums text-foreground">{value}</div>
      {detail && <div className="text-xs text-muted-foreground">{detail}</div>}
    </>
  );

  return (
    <div
      role="group"
      aria-label={label}
      data-accent={accent}
      className="relative overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm"
    >
      <div aria-hidden className="h-[3px]" style={{ background: `var(${accent})` }} />
      {filterStage !== undefined ? (
        <button
          aria-pressed={stage === filterStage}
          title={filterStage ? `Show ${stageFilterLabel(filterStage)} tickets` : 'Show all active tickets'}
          onClick={() => useSpecTicketsStore.getState().toggleStageFilter(filterStage)}
          className={`block w-full px-4 py-3 text-left hover:bg-accent ${stage === filterStage ? 'bg-accent' : ''}`}
        >
          {body}
        </button>
      ) : (
        <div className="px-4 py-3">{body}</div>
      )}
    </div>
  );
}

function ProgressRing({ pct, accent }: { pct: number | null; accent: string }) {
  const r = 11;
  const circumference = 2 * Math.PI * r;
  return (
    <svg aria-hidden viewBox="0 0 28 28" className="h-7 w-7 shrink-0 -rotate-90">
      <circle cx={14} cy={14} r={r} fill="none" stroke="var(--color-muted)" strokeWidth={4} />
      {pct !== null && pct > 0 && (
        <circle
          cx={14} cy={14} r={r} fill="none" stroke={`var(${accent})`} strokeWidth={4} strokeLinecap="round"
          strokeDasharray={`${(circumference * pct) / 100} ${circumference}`}
        />
      )}
    </svg>
  );
}
