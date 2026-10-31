import { SPEC_STAGES, type SpecStage, type SpecTicketStatus, type SpecTicketSummary } from '@shared/types/specTickets';

/** Stage views of the ticket table filter that are not ticket statuses. */
export const TILE_CROSS_VIEWS = ['in-progress', 'awaiting'] as const;
export type TileCrossView = (typeof TILE_CROSS_VIEWS)[number];

/** A stage view of the ticket table: a stage, one of the tiles' cross-stage views, or '' for all. */
export type StageFilter = SpecTicketStatus | TileCrossView | '';

export interface TicketFilter {
  user: string;
  mineOnly: boolean;
  stage: StageFilter;
  module: string;
  text: string;
}

/** Names and colours of the tiles' cross-stage views; stages spell themselves and use --stage-<stage>. */
const CROSS_VIEWS: Record<TileCrossView, { label: string; accent: string }> = {
  'in-progress': { label: 'In progress', accent: 'var(--stage-proposal)' },
  awaiting: { label: 'Awaiting approval', accent: 'var(--stage-plan)' },
};

/** Name of a stage-filter value for display; the stages themselves stay lowercase. */
export const stageFilterLabel = (stage: StageFilter): string =>
  stage in CROSS_VIEWS ? CROSS_VIEWS[stage as TileCrossView].label : stage;

/** Colour of a stage-filter dot: the stage token, or the tile's accent for a cross-stage view. */
export const stageFilterAccent = (stage: StageFilter): string =>
  stage in CROSS_VIEWS ? CROSS_VIEWS[stage as TileCrossView].accent : `var(--stage-${stage})`;

/** A ticket is in a stage view: a stage (or blocked), or one of the tiles' cross-stage views. */
function inStageView(ticket: SpecTicketSummary, stage: StageFilter): boolean {
  if (!stage) return true;
  if (stage === 'in-progress') return ticket.status !== 'done';
  if (stage === 'awaiting') return !!ticket.awaiting;
  return ticket.status === stage;
}

export interface SpecSummary {
  awaiting: SpecTicketSummary[];
  blocked: SpecTicketSummary[];
  tasksDone: number;
  tasksTotal: number;
  completionPct: number | null;
}

/** Pipeline order of the stage distribution chart: the stages, then blocked. */
export const DISTRIBUTION_ORDER: SpecTicketStatus[] = [...SPEC_STAGES, 'blocked'];

export interface StageShare {
  stage: SpecTicketStatus;
  count: number;
  /** Share of the active tickets, 0–100, unrounded (round once, for display only). */
  pct: number;
}

/** Non-empty stages of the active (non-archived) tickets, in pipeline order. */
export function stageDistribution(tickets: SpecTicketSummary[]): { total: number; shares: StageShare[] } {
  const active = tickets.filter((t) => !t.archived);
  const total = active.length;
  const shares = DISTRIBUTION_ORDER
    .map((stage) => ({ stage, count: active.filter((t) => t.status === stage).length }))
    .filter((s) => s.count > 0)
    .map((s) => ({ ...s, pct: (100 * s.count) / total }));
  return { total, shares };
}

export interface Kpis {
  active: number;
  /** Active tickets that are not done; blocked tickets count. */
  inProgress: number;
  awaiting: number;
  blocked: number;
  done: number;
  tasksDone: number;
  tasksTotal: number;
  completionPct: number | null;
}

/** Headline counts of the Dashboard's KPI tiles, over the active (non-archived) tickets. */
export function kpis(tickets: SpecTicketSummary[]): Kpis {
  const active = tickets.filter((t) => !t.archived);
  const tasksDone = active.reduce((n, t) => n + t.tasks.done, 0);
  const tasksTotal = active.reduce((n, t) => n + t.tasks.total, 0);
  return {
    active: active.length,
    inProgress: active.filter((t) => t.status !== 'done').length,
    awaiting: active.filter((t) => t.awaiting).length,
    blocked: active.filter((t) => t.status === 'blocked').length,
    done: active.filter((t) => t.status === 'done').length,
    tasksDone,
    tasksTotal,
    completionPct: tasksTotal ? Math.round((100 * tasksDone) / tasksTotal) : null,
  };
}

export function isMine(ticket: SpecTicketSummary, user: string): boolean {
  const me = user.trim().toLowerCase();
  return me !== '' && ticket.owner.trim().toLowerCase() === me;
}

/** Without a git user there is no "me", so the mine-only filter falls back to all tickets. */
export function filterTickets(tickets: SpecTicketSummary[], f: TicketFilter): SpecTicketSummary[] {
  const text = f.text.trim().toLowerCase();
  return tickets.filter((t) =>
    (!f.mineOnly || !f.user.trim() || isMine(t, f.user))
    && inStageView(t, f.stage)
    && (!f.module || t.modules.includes(f.module))
    && (!text || t.id.toLowerCase().includes(text) || t.title.toLowerCase().includes(text)));
}

/** Position 0–5 in the stage sequence; a blocked ticket sits at the stage it was blocked from. */
export function stageIndex(ticket: SpecTicketSummary): number {
  const stage = ticket.status === 'blocked' ? ticket.blockedFrom : ticket.status;
  return Math.max(0, SPEC_STAGES.indexOf(stage as SpecStage));
}

export function summarize(tickets: SpecTicketSummary[], user: string): SpecSummary {
  const active = tickets.filter((t) => !t.archived);
  const mineFirst = (ts: SpecTicketSummary[]) =>
    [...ts.filter((t) => isMine(t, user)), ...ts.filter((t) => !isMine(t, user))];
  const tasksDone = active.reduce((n, t) => n + t.tasks.done, 0);
  const tasksTotal = active.reduce((n, t) => n + t.tasks.total, 0);

  return {
    awaiting: mineFirst(active.filter((t) => t.awaiting)),
    blocked: mineFirst(active.filter((t) => t.status === 'blocked')),
    tasksDone,
    tasksTotal,
    completionPct: tasksTotal ? Math.round((100 * tasksDone) / tasksTotal) : null,
  };
}
