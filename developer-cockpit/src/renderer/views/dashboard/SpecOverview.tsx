import React, { useEffect } from 'react';
import type { SpecTicketSummary } from '@shared/types/specTickets';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { isMine, summarize } from '@/lib/spec-tickets';
import { openTicket } from '@/lib/open-ticket';
import { useSpecTicketsStore } from '@/stores/specTickets';
import { useSpecTicketsLiveRefresh } from '@/hooks/useSpecTicketsLiveRefresh';
import { StageDistribution } from './StageDistribution';

/**
 * Spec-workflow summary on the Dashboard: stage distribution, task completion and what needs me.
 * It also loads the tickets (and keeps them live) for the ticket table below it.
 */
export function SpecOverview() {
  const tickets = useSpecTicketsStore((s) => s.tickets);
  const user = useSpecTicketsStore((s) => s.user);
  const load = useSpecTicketsStore((s) => s.load);
  useSpecTicketsLiveRefresh();

  useEffect(() => {
    load();
  }, [load]);

  const s = summarize(tickets, user);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Spec workflow</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <StageDistribution tickets={tickets} />
          <div className="max-w-xs">
            <div className="text-xs text-muted-foreground">Task completion</div>
            <div className="text-lg font-semibold tabular-nums">{s.completionPct === null ? '–' : `${s.completionPct}%`}</div>
            {s.completionPct !== null && (
              <div className="h-1.5 rounded-full bg-muted">
                <div className="h-1.5 rounded-full bg-primary" style={{ width: `${s.completionPct}%` }} />
              </div>
            )}
            <div className="mt-1 text-xs text-muted-foreground">{s.tasksDone} of {s.tasksTotal} tasks across active tickets</div>
          </div>
        </CardContent>
      </Card>

      <Card role="region" aria-label="Needs me">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Needs me</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <TicketLinks label="Awaiting approval" tickets={s.awaiting} user={user}
            detail={(t) => t.awaiting} empty="Nothing waiting for approval." />
          <TicketLinks label="Blocked" tickets={s.blocked} user={user}
            detail={(t) => t.blockedReason} empty="Nothing blocked." />
          <TicketLinks label="Mine in progress" tickets={s.mineInProgress} user={user}
            detail={(t) => (t.status === 'blocked' ? `blocked at ${t.blockedFrom}` : t.status)}
            empty="None of your tickets is in progress." />
        </CardContent>
      </Card>
    </div>
  );
}

interface TicketLinksProps {
  label: string;
  tickets: SpecTicketSummary[];
  user: string;
  empty: string;
  detail: (t: SpecTicketSummary) => string;
}

function TicketLinks({ label, tickets, user, empty, detail }: TicketLinksProps) {
  return (
    <section aria-label={label}>
      <h3 className="mb-1 text-sm font-semibold">{label}</h3>
      {tickets.length ? (
        <ul className="space-y-1">
          {tickets.map((t) => (
            <li key={t.id}>
              <button className="w-full rounded px-2 py-1 text-left text-sm hover:bg-accent" onClick={() => openTicket(t.id)}>
                <span className="font-mono text-xs text-muted-foreground">{t.id}</span>{' '}
                <span>{t.title}</span>{' '}
                <span className="text-xs text-muted-foreground">
                  · {detail(t)}{isMine(t, user) ? ' · mine' : ` · ${t.owner}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}
