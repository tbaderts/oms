import React, { useState } from 'react';
import { SPEC_STAGES, type SpecStage, type SpecTicketSummary } from '@shared/types/specTickets';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { stageIndex } from '@/lib/spec-tickets';
import { useSpecTicketsStore } from '@/stores/specTickets';
import { useDocEditorStore } from '@/stores/docEditor';
import { ApproveDialog } from './ApproveDialog';
import { ActionOutput } from './ActionOutput';

type Prompt = 'note' | 'block' | 'reopen' | 'approve' | null;

/** Every button runs one `spec.mjs` command; the CLI decides what is allowed. */
export function TicketActions({ ticket }: { ticket: SpecTicketSummary }) {
  const run = useSpecTicketsStore((s) => s.run);
  const running = useSpecTicketsStore((s) => s.running);
  const user = useSpecTicketsStore((s) => s.user);
  const lastResult = useSpecTicketsStore((s) => (s.lastResultFor === ticket.id ? s.lastResult : null));
  // Advance and Approve act on the saved files, so they wait for unsaved edits.
  const unsaved = useDocEditorStore((s) => s.ticketId === ticket.id && s.dirty);
  const unsavedTitle = unsaved ? 'Save or discard your edits first' : undefined;
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [text, setText] = useState('');
  const earlier = SPEC_STAGES.slice(0, stageIndex(ticket));
  const [reopenTo, setReopenTo] = useState<SpecStage>(earlier[0] ?? 'proposal');

  if (ticket.archived) {
    return <p className="text-xs text-muted-foreground">Archived tickets are read-only.</p>;
  }

  const open = (p: Prompt) => {
    setText('');
    setReopenTo(earlier[0] ?? 'proposal');
    setPrompt(p);
  };
  const close = () => setPrompt(null);
  const submit = (fn: () => Promise<unknown>) => {
    close();
    fn();
  };
  const id = ticket.id;
  const blocked = ticket.status === 'blocked';
  const done = ticket.status === 'done';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => run({ kind: 'advance', id })}
          disabled={running || unsaved || blocked || done || Boolean(ticket.awaiting)}
          title={unsavedTitle}
        >
          Advance
        </Button>
        {ticket.awaiting && (
          <Button
            size="sm"
            className="bg-amber-500 text-white hover:bg-amber-500/90"
            onClick={() => open('approve')}
            disabled={running || unsaved}
            title={unsavedTitle}
          >
            Approve…
          </Button>
        )}
        {earlier.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => open('reopen')} disabled={running}>Reopen…</Button>
        )}
        {blocked ? (
          <Button size="sm" variant="outline" onClick={() => run({ kind: 'unblock', id })} disabled={running}>Unblock</Button>
        ) : (
          !done && <Button size="sm" variant="outline" onClick={() => open('block')} disabled={running}>Block…</Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => open('note')} disabled={running}>Note…</Button>
        <div className="ml-auto flex items-center gap-2">
          <Switch
            id={`autopilot-${id}`}
            checked={ticket.autopilot}
            disabled={running}
            onCheckedChange={(on) => run({ kind: 'autopilot', id, on })}
          />
          <Label htmlFor={`autopilot-${id}`} className="text-xs">Autopilot</Label>
        </div>
      </div>

      {lastResult && <ActionOutput result={lastResult} />}

      <ApproveDialog
        ticket={ticket}
        user={user}
        open={prompt === 'approve'}
        onOpenChange={(o) => !o && close()}
        onConfirm={() => submit(() => run({ kind: 'approve', id }))}
      />

      <Dialog open={prompt === 'note' || prompt === 'block' || prompt === 'reopen'} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {prompt === 'note' ? `Add a note to ${id}` : prompt === 'block' ? `Block ${id}` : `Reopen ${id}`}
            </DialogTitle>
          </DialogHeader>
          {prompt === 'reopen' && (
            <div className="space-y-1">
              <Label htmlFor="reopen-stage">Back to stage</Label>
              <select
                id="reopen-stage"
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                value={reopenTo}
                onChange={(e) => setReopenTo(e.target.value as SpecStage)}
              >
                {earlier.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <p className="text-xs text-muted-foreground">Approvals from that stage on are cleared.</p>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="action-text">{prompt === 'note' ? 'Note' : 'Reason'}</Label>
            <Input id="action-text" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={close}>Cancel</Button>
            {prompt === 'note' && <Button onClick={() => submit(() => run({ kind: 'note', id, text }))}>Add note</Button>}
            {prompt === 'block' && <Button variant="destructive" onClick={() => submit(() => run({ kind: 'block', id, reason: text }))}>Block ticket</Button>}
            {prompt === 'reopen' && <Button onClick={() => submit(() => run({ kind: 'reopen', id, stage: reopenTo, reason: text }))}>Reopen ticket</Button>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
