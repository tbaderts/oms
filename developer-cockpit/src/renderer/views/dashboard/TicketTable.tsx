import React, { useMemo } from 'react';
import { AlertTriangle, Bot, Hourglass } from 'lucide-react';
import { SPEC_STAGES } from '@shared/types/specTickets';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { filterTickets, stageFilterLabel, TILE_CROSS_VIEWS, type StageFilter } from '@/lib/spec-tickets';
import { openTicket } from '@/lib/open-ticket';
import { useSpecTicketsStore } from '@/stores/specTickets';
import { useNavigationStore } from '@/stores/navigation';
import { StageBadge, TaskProgress } from '@/views/spec-tickets/StageProgress';
import { NewTicketDialog } from '@/views/spec-tickets/NewTicketDialog';
import { ActionOutput } from '@/views/spec-tickets/ActionOutput';

const ANY = 'any';

/** All tickets with filters, on the Dashboard; a row opens the ticket in the Spec Tickets workspace. */
export function TicketTable() {
  const setActiveView = useNavigationStore((s) => s.setActiveView);
  const {
    tickets, user, errors, mineOnly, stage, module, text, showArchived, selectedId,
    lastResult, lastResultFor, setFilter, setShowArchived,
  } = useSpecTicketsStore();

  const modules = useMemo(() => [...new Set(tickets.flatMap((t) => t.modules))].sort(), [tickets]);
  const visible = filterTickets(tickets, { user, mineOnly, stage, module, text });

  return (
    <section aria-label="Tickets" className="flex flex-col rounded-md border">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-base font-semibold">Tickets</h2>
        <NewTicketDialog onCreated={() => setActiveView('spec-tickets')} />
      </div>
      {lastResult && lastResultFor === null && (
        <div className="border-b px-4 py-2">
          <ActionOutput result={lastResult} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
        <div className="flex rounded-md border">
          <Button size="sm" variant={mineOnly ? 'secondary' : 'ghost'} aria-pressed={mineOnly} onClick={() => setFilter({ mineOnly: true })}>
            My tickets
          </Button>
          <Button size="sm" variant={!mineOnly ? 'secondary' : 'ghost'} aria-pressed={!mineOnly} onClick={() => setFilter({ mineOnly: false })}>
            All tickets
          </Button>
        </div>
        <Select value={stage || ANY} onValueChange={(v) => setFilter({ stage: v === ANY ? '' : (v as typeof stage) })}>
          <SelectTrigger className="h-8 w-32" aria-label="Stage filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>All stages</SelectItem>
            {([...TILE_CROSS_VIEWS, ...SPEC_STAGES, 'blocked'] as StageFilter[]).map((s) => (
              <SelectItem key={s} value={s}>{stageFilterLabel(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={module || ANY} onValueChange={(v) => setFilter({ module: v === ANY ? '' : v })}>
          <SelectTrigger className="h-8 w-44" aria-label="Module filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>All modules</SelectItem>
            {modules.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          className="h-8 w-48"
          placeholder="Search id or title"
          value={text}
          onChange={(e) => setFilter({ text: e.target.value })}
        />
        <div className="flex items-center gap-2">
          <Switch id="show-archived" checked={showArchived} onCheckedChange={(v) => setShowArchived(v)} />
          <Label htmlFor="show-archived" className="text-xs">Show archived</Label>
        </div>
        {mineOnly && !user && (
          <span className="text-xs text-muted-foreground">No git user.name configured: showing all tickets</span>
        )}
      </div>

      <div className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Tasks</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((t) => (
              <TableRow
                key={t.id}
                className={cn('cursor-pointer', selectedId === t.id && 'bg-accent')}
                onClick={() => openTicket(t.id)}
              >
                <TableCell className="font-mono text-xs">{t.id}</TableCell>
                <TableCell>
                  <div>{t.title}</div>
                  <div className="text-xs text-muted-foreground">{t.type} · {t.modules.join(', ')}</div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    {!t.archived && <span aria-hidden data-testid="stage-dot" className="h-2 w-2 shrink-0 rounded-full" style={{ background: `var(--stage-${t.status})` }} />}
                    <StageBadge ticket={t} />
                  </div>
                </TableCell>
                <TableCell className="text-xs">{t.owner}</TableCell>
                <TableCell><TaskProgress done={t.tasks.done} total={t.tasks.total} /></TableCell>
                <TableCell>
                  <div className="flex gap-1 text-muted-foreground">
                    {t.awaiting && <span title={`Awaiting approval of ${t.awaiting}`}><Hourglass className="h-4 w-4 text-amber-500" /></span>}
                    {t.status === 'blocked' && <span title={t.blockedReason}><AlertTriangle className="h-4 w-4 text-destructive" /></span>}
                    {t.autopilot && <span title="Autopilot on"><Bot className="h-4 w-4" /></span>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {errors.map((e) => (
              <TableRow key={e.dir}>
                <TableCell colSpan={6} className="text-xs text-destructive">
                  Could not load {e.dir}: {e.error}
                </TableCell>
              </TableRow>
            ))}
            {!visible.length && !errors.length && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">No tickets match.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
