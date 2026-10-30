import React, { useEffect } from 'react';
import { LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSpecTicketsStore } from '@/stores/specTickets';
import { useNavigationStore } from '@/stores/navigation';
import { TicketDetail } from './TicketDetail';
import { TicketSwitcher } from './TicketSwitcher';
import { NewTicketDialog } from './NewTicketDialog';
import { ActionOutput } from './ActionOutput';

/** Workspace for one ticket across the whole content area; all tickets live on the Dashboard. */
export function SpecTicketsView() {
  const refresh = useSpecTicketsStore((s) => s.refresh);
  const selectedId = useSpecTicketsStore((s) => s.selectedId);
  const error = useSpecTicketsStore((s) => s.error);
  const lastResult = useSpecTicketsStore((s) => (s.lastResultFor === null ? s.lastResult : null));
  const setActiveView = useNavigationStore((s) => s.setActiveView);

  // Loads the tickets for the switcher and re-reads the open ticket (it may be remembered from before).
  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="flex h-full flex-col">
      <header aria-label="Ticket workspace" className="flex items-center gap-2 border-b px-6 py-2">
        <TicketSwitcher />
        <div className="flex-1" />
        <NewTicketDialog />
        <Button size="sm" variant="ghost" onClick={() => setActiveView('dashboard')}>
          <LayoutDashboard className="mr-1 h-4 w-4" /> All tickets
        </Button>
      </header>
      {lastResult && (
        <div className="border-b px-6 py-2">
          <ActionOutput result={lastResult} />
        </div>
      )}
      {error && <div className="border-b bg-destructive/10 px-6 py-2 text-sm text-destructive">{error}</div>}
      <div className="min-h-0 flex-1 overflow-auto">
        {selectedId ? (
          <TicketDetail />
        ) : (
          <p className="p-6 text-sm text-muted-foreground">
            Pick a ticket above, or browse all tickets on the{' '}
            <Button variant="link" className="h-auto p-0 text-sm" onClick={() => setActiveView('dashboard')}>
              Dashboard
            </Button>
            .
          </p>
        )}
      </div>
    </div>
  );
}
