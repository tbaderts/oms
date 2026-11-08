import { useNavigationStore } from '@/stores/navigation';
import { useSpecTicketsStore } from '@/stores/specTickets';

/**
 * Opens a ticket in the Spec Tickets workspace. Selection goes first so its unsaved-edit guard can
 * cancel the whole move: if the user keeps their edits, the view does not change either. The guard
 * and the new selection are synchronous, so the view switches at once and shows a spinner while
 * the ticket (a `spec status` run that can take seconds) loads.
 */
export async function openTicket(id: string): Promise<void> {
  const loading = useSpecTicketsStore.getState().select(id);
  if (useSpecTicketsStore.getState().selectedId === id) useNavigationStore.getState().setActiveView('spec-tickets');
  await loading;
}
