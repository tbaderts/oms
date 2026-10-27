import React from 'react';
import { SPEC_STAGES, type SpecTicketSummary } from '@shared/types/specTickets';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { stageIndex } from '@/lib/spec-tickets';

export function StageBadge({ ticket }: { ticket: SpecTicketSummary }) {
  if (ticket.archived) return <Badge variant="outline">archived</Badge>;
  if (ticket.status === 'blocked') return <Badge variant="destructive">blocked</Badge>;
  return <Badge variant={ticket.status === 'done' ? 'secondary' : 'default'}>{ticket.status}</Badge>;
}

export function TaskProgress({ done, total }: { done: number; total: number }) {
  if (!total) return <span className="text-xs text-muted-foreground">–</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-muted">
        <div className="h-1.5 rounded-full bg-primary" style={{ width: `${(100 * done) / total}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{done}/{total}</span>
    </div>
  );
}

/** The six workflow stages with the ticket's position; a blocked ticket shows red at the stage it stopped in. */
export function StageProgress({ ticket }: { ticket: SpecTicketSummary }) {
  const current = stageIndex(ticket);
  const blocked = ticket.status === 'blocked';
  return (
    <ol className="flex items-center gap-1">
      {SPEC_STAGES.map((stage, i) => {
        const isCurrent = i === current;
        return (
          <li
            key={stage}
            aria-label={`Stage ${stage}${isCurrent ? ' (current)' : ''}`}
            className="flex items-center gap-1"
          >
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs',
                i < current && 'bg-primary/20 text-foreground',
                isCurrent && (blocked ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground'),
                i > current && 'bg-muted text-muted-foreground',
              )}
            >
              {stage}
            </span>
            {i < SPEC_STAGES.length - 1 && <span className="text-muted-foreground">›</span>}
          </li>
        );
      })}
    </ol>
  );
}
