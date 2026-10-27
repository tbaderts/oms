import React from 'react';
import { useSpecTicketsStore } from '@/stores/specTickets';
import { SpecOverview } from './SpecOverview';
import { TicketTable } from './TicketTable';

/** Portfolio of spec work: how tickets are distributed, what needs me, and all tickets. */
export function DashboardView() {
  // Load and action failures (CLI not runnable, bad JSON, IPC errors) must not look like "no tickets".
  const error = useSpecTicketsStore((s) => s.error);
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Spec-driven work across all tickets</p>
      </div>
      {error && (
        <div role="alert" className="rounded-md border border-destructive bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      <SpecOverview />
      <TicketTable />
    </div>
  );
}
