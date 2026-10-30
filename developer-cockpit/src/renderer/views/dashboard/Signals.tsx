import React from 'react';
import { AlertTriangle, ChevronRight, Hourglass } from 'lucide-react';
import type { SpecTicketSummary } from '@shared/types/specTickets';
import { isMine, summarize } from '@/lib/spec-tickets';
import { collectSignals, type Signal } from '@/lib/signals';
import { openTicket } from '@/lib/open-ticket';
import { useSignalsStore } from '@/stores/signals';
import { cn } from '@/lib/utils';
import { SignalLevelIcon } from '@/components/SignalLevelIcon';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const when = (s: Signal, day: string) => (s.date === day || !s.date ? s.time : `${s.date.slice(5)} ${s.time}`.trim());

/*
 * What waits for a human (Your turn) and what just happened (Activity), from the ticket logs
 * (SPEC-0016). Both live in the Dashboard's Ticket progress card; Activity is a one-line bar that
 * expands into the feed (SPEC-0017).
 */

export function YourTurn({ tickets, user }: { tickets: SpecTicketSummary[]; user: string }) {
  const s = summarize(tickets, user);
  const all = [
    ...s.awaiting.map((t) => ({ t, icon: Hourglass, tint: 'text-warning', detail: `approve ${t.awaiting}` })),
    ...s.blocked.map((t) => ({ t, icon: AlertTriangle, tint: 'text-destructive', detail: t.blockedReason || 'blocked' })),
  ];
  // The user's own entries first across both kinds; awaiting before blocked within each owner.
  const entries = [...all.filter((e) => isMine(e.t, user)), ...all.filter((e) => !isMine(e.t, user))];
  return (
    <section aria-label="Your turn">
      <h3 className="mb-1 text-sm font-semibold">Your turn</h3>
      {entries.length ? (
        <ul className="max-h-40 space-y-0.5 overflow-y-auto pr-1">
          {entries.map(({ t, icon: Icon, tint, detail }) => (
            <li key={`${t.id}-${detail}`}>
              <button className="flex w-full items-start gap-2 rounded px-2 py-1 text-left text-sm hover:bg-accent" onClick={() => openTicket(t.id)}>
                <Icon aria-hidden className={cn('mt-0.5 h-4 w-4 shrink-0', tint)} />
                <span className="min-w-0">
                  <span className="font-mono text-xs text-muted-foreground">{t.id}</span>{' '}
                  <span>{t.title}</span>{' '}
                  <span className="text-xs text-muted-foreground">· {detail}{isMine(t, user) ? ' · mine' : ` · ${t.owner}`}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Nothing needs you.</p>
      )}
    </section>
  );
}

/** One-line summary of the latest signal; a click expands the feed below it. */
export function ActivityBar({ tickets }: { tickets: SpecTicketSummary[] }) {
  const fresh = useSignalsStore((s) => s.fresh);
  const expanded = useSignalsStore((s) => s.activityExpanded);
  const setExpanded = useSignalsStore((s) => s.setActivityExpanded);
  const signals = collectSignals(tickets);
  const day = today();

  if (!signals.length) return <p className="px-2 py-1 text-xs text-muted-foreground">No activity yet.</p>;

  const latest = signals[0];
  const newCount = signals.filter((s) => fresh.has(s.key)).length;
  return (
    <div>
      <button
        aria-expanded={expanded}
        aria-controls="activity-feed"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
      >
        <ChevronRight aria-hidden className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-90')} />
        <span className="shrink-0 font-semibold">Activity</span>
        {newCount > 0 && <span className="shrink-0 rounded-full bg-primary px-1.5 text-[10px] font-medium text-primary-foreground">{newCount} new</span>}
        <span aria-hidden className="shrink-0 text-muted-foreground">·</span>
        <SignalLevelIcon level={latest.level} />
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{latest.level}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{when(latest, day)}</span>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">{latest.ticketId}</span>
        <span className="min-w-0 truncate">{latest.text}</span>
      </button>
      {expanded && <ActivityFeed signals={signals} fresh={fresh} day={day} />}
    </div>
  );
}

function ActivityFeed({ signals, fresh, day }: { signals: Signal[]; fresh: Set<string>; day: string }) {
  return (
    <section id="activity-feed" aria-label="Activity" className="mt-1">
      <ol className="max-h-[22rem] space-y-0.5 overflow-y-auto pr-1">
        {signals.map((s) => (
          <li key={s.key} data-level={s.level} data-new={fresh.has(s.key) ? 'true' : undefined}>
            <button className="flex w-full items-start gap-2 rounded px-2 py-1 text-left text-sm hover:bg-accent" onClick={() => openTicket(s.ticketId)}>
              <SignalLevelIcon level={s.level} className="mt-0.5" />
              <span className="w-[4.5rem] shrink-0 pt-px text-xs tabular-nums text-muted-foreground">
                {when(s, day)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide">{s.level}</span>
                  <span className="shrink-0 font-mono">{s.ticketId}</span>
                  {fresh.has(s.key) && <span className="shrink-0 rounded-full bg-primary px-1.5 text-[10px] font-medium text-primary-foreground">new</span>}
                  <span className="truncate" title={s.title}>{s.title}</span>
                </span>
                <span className="block break-words">{s.text}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
