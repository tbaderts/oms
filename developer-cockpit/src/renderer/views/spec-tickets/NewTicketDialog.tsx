import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSpecTicketsStore } from '@/stores/specTickets';

/** `onCreated` runs after the CLI created (and the store selected) the new ticket. */
export function NewTicketDialog({ onCreated }: { onCreated?: (id: string) => void } = {}) {
  const run = useSpecTicketsStore((s) => s.run);
  const running = useSpecTicketsStore((s) => s.running);
  // Types come from specs/config.json; the CLI still validates type and modules.
  const configured = useSpecTicketsStore((s) => s.types);
  const types = configured.length ? configured : ['feature'];
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('feature');
  const [modules, setModules] = useState('');
  const [goal, setGoal] = useState('');

  const moduleList = modules.split(',').map((m) => m.trim()).filter(Boolean);
  const valid = title.trim() && goal.trim() && moduleList.length > 0;

  const submit = async () => {
    setOpen(false);
    const created = await run({ kind: 'new', title: title.trim(), type, modules: moduleList, goal: goal.trim() });
    if (created) onCreated?.(created);
    setTitle('');
    setModules('');
    setGoal('');
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={running}>
        <Plus className="mr-1 h-4 w-4" /> New ticket
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New spec ticket</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="new-title">Title</Label>
              <Input id="new-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Reject zero-quantity orders" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-type">Type</Label>
              <select
                id="new-type"
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                {types.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-modules">Modules (comma-separated)</Label>
              <Input id="new-modules" value={modules} onChange={(e) => setModules(e.target.value)} placeholder="oms-core, oms-contracts" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-goal">Goal (the requester's words)</Label>
              <textarea
                id="new-goal"
                className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={!valid || running}>Create ticket</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
