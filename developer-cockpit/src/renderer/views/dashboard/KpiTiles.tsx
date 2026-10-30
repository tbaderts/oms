import React from 'react';
import { AlertTriangle, CheckCircle2, Hourglass, Layers, PlayCircle, type LucideIcon } from 'lucide-react';
import type { SpecTicketStatus, SpecTicketSummary } from '@shared/types/specTickets';
import { kpis } from '@/lib/spec-tickets';
import { useSpecTicketsStore } from '@/stores/specTickets';
import { toggleStage } from './StageDonut';

interface TileProps {
  label: string;
  value: string;
  /** A --stage-* token; it marks the tile's identity (top band and icon), never its text. */
  accent: string;
  icon: LucideIcon;
  iconTag?: string;
  /** Stage the tile filters the ticket table to, if it filters at all. */
  filterStage?: SpecTicketStatus;
  detail?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * Headline numbers of the active tickets. Values and labels stay in text tokens; each tile's
 * colour band and icon carry its identity. The Blocked and Done tiles toggle the stage filter.
 */
export function KpiTiles({ tickets, unavailable }: { tickets: SpecTicketSummary[]; unavailable: boolean }) {
  const k = kpis(tickets);
  const n = (v: number) => (unavailable ? '–' : String(v));
  const completion = unavailable || k.completionPct === null ? '–' : `${k.completionPct}%`;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <Tile label="Active tickets" value={n(k.active)} accent="--stage-implement" icon={Layers} />
      <Tile label="In progress" value={n(k.inProgress)} accent="--stage-proposal" icon={PlayCircle} />
      <Tile label="Awaiting approval" value={n(k.awaiting)} accent="--stage-plan" icon={Hourglass} />
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
      {filterStage ? (
        <button
          aria-pressed={stage === filterStage}
          title={`Show ${filterStage} tickets`}
          onClick={() => toggleStage(filterStage)}
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
