import React, { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Pencil } from 'lucide-react';
import {
  DOCUMENT_FILES,
  SPEC_DOCUMENTS,
  editableDocument,
  type SpecDocument,
  type SpecEvidence,
  type SpecTicketDetail,
} from '@shared/types/specTickets';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { MarkdownContent } from '@/components/MarkdownContent';
import { useSpecTicketsStore } from '@/stores/specTickets';
import { useDocEditorStore } from '@/stores/docEditor';
import { StageBadge, StageProgress, TaskProgress } from './StageProgress';
import { GateResult } from './GateResult';
import { TicketActions } from './TicketActions';
import { DocumentEditor } from './DocumentEditor';

export function TicketDetail() {
  const detail = useSpecTicketsStore((s) => s.detail);
  if (!detail) return <LoadingSpinner />;
  return <TicketDetailBody key={detail.id} detail={detail} />;
}

function TicketDetailBody({ detail }: { detail: SpecTicketDetail }) {
  const docs = SPEC_DOCUMENTS.filter((d) => detail.documents[d] !== undefined);
  const editable = editableDocument(detail);
  const [tab, setTab] = useState<string>(editable && docs.includes(editable) ? editable : docs[0]);
  const editing = useDocEditorStore((s) => (s.ticketId === detail.id ? s.doc : null));
  // Unsaved text is gated as a draft; show that result instead of the saved file's.
  const draftGate = useDocEditorStore((s) => (s.ticketId === detail.id && s.dirty ? s.draftGate : null));

  // The stage moved on outside the editor (e.g. `spec advance`): the open document can no longer be
  // saved, so close it, asking first when there are unsaved edits.
  useEffect(() => {
    if (editing && editing !== editable) useDocEditorStore.getState().confirmLeave();
  }, [editing, editable]);

  const diskContent = editing ? detail.documents[editing] : undefined;
  useEffect(() => {
    if (editing && diskContent !== undefined) useDocEditorStore.getState().syncFromDisk(detail.id, editing, diskContent);
  }, [detail.id, editing, diskContent]);

  const changeTab = (value: string) => {
    if (editing && value !== editing && !useDocEditorStore.getState().confirmLeave()) return;
    setTab(value);
  };

  const startEditing = (doc: SpecDocument) => {
    useDocEditorStore.getState().open(detail.id, doc, detail.documents[doc] ?? '');
    setTab(doc);
  };

  // Main column: the ticket and its documents; rail: where it stands and what to do next.
  return (
    <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section aria-label="Ticket" className="min-w-0 space-y-6">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">{detail.id}</span>
            <StageBadge ticket={detail} />
            <Badge variant="outline">{detail.type}</Badge>
            {detail.awaiting && <Badge className="bg-amber-500 text-white">awaiting approval of {detail.awaiting}</Badge>}
            {detail.autopilot && <Badge variant="outline">autopilot</Badge>}
          </div>
          <h2 className="text-xl font-semibold">{detail.title}</h2>
          <div className="text-xs text-muted-foreground">
            {detail.owner || 'no owner'} · {detail.modules.join(', ') || 'no modules'} · created {detail.created}
            {detail.approvals.length > 0 && <> · approved: {detail.approvals.join(', ')}</>}
          </div>
          <StageProgress ticket={detail} />
          {detail.status === 'blocked' && (
            <p className="text-sm text-destructive">Blocked at {detail.blockedFrom}: {detail.blockedReason}</p>
          )}
        </header>

        <section>
          <h3 className="mb-1 text-sm font-semibold">Goal</h3>
          <p className="whitespace-pre-wrap text-sm">{detail.goal}</p>
        </section>

        {docs.length > 0 && (
          <Tabs value={tab} onValueChange={changeTab}>
            <div className="flex flex-wrap items-center gap-2">
              <TabsList>
                {docs.map((d) => <TabsTrigger key={d} value={d}>{d}.md</TabsTrigger>)}
              </TabsList>
              {editable && docs.includes(editable) && editing !== editable && (
                <Button size="sm" variant="outline" onClick={() => startEditing(editable)}>
                  <Pencil className="mr-1 h-3.5 w-3.5" />
                  Edit {DOCUMENT_FILES[editable]}
                </Button>
              )}
            </div>
            {docs.map((d) => (
              <TabsContent key={d} value={d} className="pt-2">
                {editing === d ? (
                  <DocumentEditor />
                ) : (
                  <>
                    {editable && d !== editable && (
                      <p className="mb-2 text-xs text-muted-foreground">
                        Read-only: only {DOCUMENT_FILES[editable]} can be edited at this stage. To change an earlier
                        stage, use Reopen.
                      </p>
                    )}
                    <MarkdownContent content={detail.documents[d] ?? ''} />
                  </>
                )}
              </TabsContent>
            ))}
          </Tabs>
        )}

        <section>
          <h3 className="mb-1 text-sm font-semibold">Log</h3>
          <ul className="space-y-0.5 font-mono text-xs text-muted-foreground">
            {detail.log.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </section>
      </section>

      <aside aria-label="Ticket status" className="space-y-4 lg:sticky lg:top-0 lg:self-start">
        <section className="space-y-2 rounded-md border p-4">
          <GateResult gate={draftGate ?? detail.gate} draft={draftGate !== null} />
          <p className="text-xs text-muted-foreground">Next: {detail.next}</p>
          <TicketActions ticket={detail} />
        </section>
        <Traceability ticket={detail} />
        <Evidence evidence={detail.evidence} />
      </aside>
    </div>
  );
}

function Traceability({ ticket }: { ticket: SpecTicketDetail }) {
  const canTick = ticket.status === 'implement' && !ticket.archived;
  // Ticking writes tasks.md, so it waits while that file has unsaved edits.
  const tasksDirty = useDocEditorStore((s) => s.ticketId === ticket.id && s.doc === 'tasks' && s.dirty);
  const [toggling, setToggling] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const toggle = async (taskId: string, done: boolean) => {
    setToggling(true);
    setNotice(null);
    try {
      const r = await window.cockpit.specTickets.toggleTask(ticket.id, taskId, done, ticket.documents.tasks ?? '', false);
      if (r.status === 'conflict') setNotice('tasks.md changed on disk; reloaded, try again.');
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setToggling(false);
    }
    await useSpecTicketsStore.getState().refresh();
  };

  return (
    <div className="rounded-md border p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Tasks</h3>
        <TaskProgress done={ticket.tasks.done} total={ticket.tasks.total} />
      </div>
      {ticket.taskList.length ? (
        <ul className="space-y-1 text-xs">
          {ticket.taskList.map((t) => (
            <li key={t.id} className="flex items-start gap-1.5">
              {canTick ? (
                <input
                  type="checkbox"
                  aria-label={`Toggle ${t.id}`}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  checked={t.done}
                  disabled={toggling || tasksDirty}
                  title={tasksDirty ? 'Save or discard your tasks.md edits first' : undefined}
                  onChange={() => toggle(t.id, !t.done)}
                />
              ) : t.done ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
              ) : (
                <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="shrink-0 whitespace-nowrap font-mono">{t.id}</span>
              <span>{t.summary}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No tasks yet.</p>
      )}
      {notice && <p className="mt-2 text-xs text-destructive">{notice}</p>}
      {ticket.acs.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {ticket.acs.map((ac) => {
            const tasks = ticket.taskList.filter((t) => t.acs.includes(ac));
            const covered = tasks.length > 0;
            const done = covered && tasks.every((t) => t.done);
            return (
              <Badge key={ac} variant={done ? 'secondary' : 'outline'} title={covered ? tasks.map((t) => t.id).join(', ') : 'no task yet'}>
                {ac}{covered ? ` · ${tasks.filter((t) => t.done).length}/${tasks.length}` : ''}
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Evidence({ evidence }: { evidence: SpecEvidence | null }) {
  return (
    <div className="rounded-md border p-4">
      <h3 className="mb-2 text-sm font-semibold">Verification evidence</h3>
      {evidence ? (
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <Badge variant={evidence.result === 'pass' ? 'secondary' : 'destructive'}>{evidence.result.toUpperCase()}</Badge>
            <Badge variant={evidence.fresh ? 'secondary' : 'outline'}>{evidence.fresh ? 'Fresh' : 'Stale'}</Badge>
            <span className="text-muted-foreground">{new Date(evidence.ranAt).toLocaleString()}</span>
          </div>
          <div className="text-muted-foreground">Modules: {evidence.modules.join(', ')}</div>
          {!evidence.coversModules && <div className="text-destructive">Does not cover every affected module; re-run spec verify.</div>}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No verification evidence yet (run spec verify).</p>
      )}
    </div>
  );
}
