import { useNavigationStore } from '@/stores/navigation';
import { useSpecTicketsStore } from '@/stores/specTickets';

/**
 * Opens a ticket in the Spec Tickets workspace. Selection goes first so its unsaved-edit guard can
 * cancel the whole move: if the user keeps their edits, the view does not change either.
 */
export async function openTicket(id: string): Promise<void> {
  await useSpecTicketsStore.getState().select(id);
  if (useSpecTicketsStore.getState().selectedId !== id) return;
  useNavigationStore.getState().setActiveView('spec-tickets');
}
