import React from 'react';
import { AlertTriangle, Hourglass } from 'lucide-react';
import type { SpecTicketSummary } from '@shared/types/specTickets';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { isMine, summarize } from '@/lib/spec-tickets';
import { collectSignals } from '@/lib/signals';
import { openTicket } from '@/lib/open-ticket';
import { useSignalsStore } from '@/stores/signals';
import { cn } from '@/lib/utils';
import { SignalLevelIcon } from '@/components/SignalLevelIcon';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * What waits for a human (Your turn) and what just happened (Activity), from the ticket logs.
 * Replaces SPEC-0006's Needs me card (SPEC-0016).
 */
export function SignalsPanel({ tickets, user, unavailable }: { tickets: SpecTicketSummary[]; user: string; unavailable: boolean }) {
  const fresh = useSignalsStore((s) => s.fresh);

  return (
    <Card role="region" aria-label="Signals">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Signals</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {unavailable ? (
          <p className="text-sm text-muted-foreground">Signals are unavailable: tickets could not be loaded.</p>
        ) : (
          <>
            <YourTurn tickets={tickets} user={user} />
            <Activity tickets={tickets} fresh={fresh} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function YourTurn({ tickets, user }: { tickets: SpecTicketSummary[]; user: string }) {
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

function Activity({ tickets, fresh }: { tickets: SpecTicketSummary[]; fresh: Set<string> }) {
  const signals = collectSignals(tickets);
  const day = today();
  return (
    <section aria-label="Activity">
      <h3 className="mb-1 text-sm font-semibold">Activity</h3>
      {signals.length ? (
        <ol className="max-h-[22rem] space-y-0.5 overflow-y-auto pr-1">
          {signals.map((s) => (
            <li key={s.key} data-level={s.level} data-new={fresh.has(s.key) ? 'true' : undefined}>
              <button className="flex w-full items-start gap-2 rounded px-2 py-1 text-left text-sm hover:bg-accent" onClick={() => openTicket(s.ticketId)}>
                <SignalLevelIcon level={s.level} className="mt-0.5" />
                <span className="w-[4.5rem] shrink-0 pt-px text-xs tabular-nums text-muted-foreground">
                  {s.date === day || !s.date ? s.time : `${s.date.slice(5)} ${s.time}`.trim()}
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
      ) : (
        <p className="text-xs text-muted-foreground">No activity yet.</p>
      )}
    </section>
  );
}
