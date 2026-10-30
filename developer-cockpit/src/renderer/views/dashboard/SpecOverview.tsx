import React, { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSpecTicketsStore } from '@/stores/specTickets';
import { KpiTiles } from './KpiTiles';
import { SignalsPanel } from './SignalsPanel';
import { StageDonut } from './StageDonut';

/**
 * Spec-workflow overview on the Dashboard: KPI tiles, the ticket-progress donut and the signals.
 * It also loads the tickets for the ticket table below it; SignalsWatcher (in App) keeps them live.
 */
export function SpecOverview() {
  const tickets = useSpecTicketsStore((s) => s.tickets);
  const user = useSpecTicketsStore((s) => s.user);
  const error = useSpecTicketsStore((s) => s.error);
  const load = useSpecTicketsStore((s) => s.load);

  useEffect(() => {
    load();
  }, [load]);

  // A failed load leaves no tickets; that must not read as an empty portfolio.
  const unavailable = !!error && !tickets.length;

  return (
    <>
      <KpiTiles tickets={tickets} unavailable={unavailable} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <Card role="region" aria-label="Ticket progress">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Ticket progress</CardTitle>
          </CardHeader>
          <CardContent>
            {unavailable
              ? <p className="text-sm text-muted-foreground">Tickets could not be loaded.</p>
              : <StageDonut tickets={tickets} />}
          </CardContent>
        </Card>

        <SignalsPanel tickets={tickets} user={user} unavailable={unavailable} />
      </div>
    </>
  );
}
