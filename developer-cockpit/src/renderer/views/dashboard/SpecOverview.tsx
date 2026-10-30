import React, { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSpecTicketsStore } from '@/stores/specTickets';
import { KpiTiles } from './KpiTiles';
import { ActivityBar, YourTurn } from './Signals';
import { StageDonut } from './StageDonut';

/**
 * Spec-workflow overview on the Dashboard: KPI tiles, then one Ticket progress card with the donut,
 * Your turn and the collapsible Activity bar (SPEC-0017).
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
      <Card role="region" aria-label="Ticket progress">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Ticket progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            {unavailable
              ? <p className="text-sm text-muted-foreground">Tickets could not be loaded.</p>
              : <StageDonut tickets={tickets} />}
            <div className="lg:border-l lg:pl-6">
              {unavailable
                ? <p className="text-sm text-muted-foreground">Signals are unavailable.</p>
                : <YourTurn tickets={tickets} user={user} />}
            </div>
          </div>
          {!unavailable && (
            <div className="border-t pt-2">
              <ActivityBar tickets={tickets} />
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
