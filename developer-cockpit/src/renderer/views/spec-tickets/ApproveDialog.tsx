import React from 'react';
import type { SpecTicketSummary } from '@shared/types/specTickets';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface ApproveDialogProps {
  ticket: SpecTicketSummary;
  user: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

/** Approval is a human gate: it always needs this explicit confirmation. */
export function ApproveDialog({ ticket, user, open, onOpenChange, onConfirm }: ApproveDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve {ticket.awaiting}</DialogTitle>
        </DialogHeader>
        <p className="text-sm">Approve {ticket.awaiting} of {ticket.id} — {ticket.title}?</p>
        <p className="text-xs text-muted-foreground">
          This is recorded in the ticket log as approved by {user || 'your git user.name'}. Review the{' '}
          {ticket.awaiting} document before approving.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onConfirm}>Confirm approval</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
