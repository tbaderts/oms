import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import '@/lib/monaco';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MarkdownContent } from '@/components/MarkdownContent';
import { SLUG } from '@shared/storyboards/ids';
import { LANE_KINDS, STORY_STATUSES, type Lane, type StoryPatch, type StoryStatus, type StoryboardDetail } from '@shared/types/storyboards';
import { useStoryboardsStore } from '@/stores/storyboards';
import { useConflictStore } from './useStoryboardEdits';

const input = 'w-full rounded-md border border-input bg-background px-2 py-1 text-sm';

/** Edits story.md: metadata, lanes and the story prose. Step order is changed in the strip. */
export function StoryEditor({ d }: { d: StoryboardDetail }) {
  const { setEditing, refresh } = useStoryboardsStore.getState();
  const [title, setTitle] = useState(d.title);
  const [status, setStatus] = useState<StoryStatus>(d.status);
  const [owner, setOwner] = useState(d.owner ?? '');
  const [tags, setTags] = useState(d.tags.join(', '));
  const [lanes, setLanes] = useState<Lane[]>(d.lanes);
  const [body, setBody] = useState(d.body);
  const [error, setError] = useState<string | null>(null);

  const laneIds = lanes.map((l) => l.id);
  const laneProblem = lanes.find((l, i) => !SLUG.test(l.id) || laneIds.indexOf(l.id) !== i || !l.label.trim());

  const save = async (revision = d.revision) => {
    const patch: StoryPatch = {
      title: title.trim(),
      status,
      ...(owner.trim() && { owner: owner.trim() }),
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      lanes,
    };
    const r = await window.cockpit.storyboards.saveStory(d.id, patch, body, revision);
    if (r.ok) {
      setEditing(null);
      await refresh();
    } else if (r.code === 'conflict') {
      useConflictStore.getState().set({
        message: 'story.md changed on disk since you opened it.',
        latestRevision: r.latestRevision,
        overwrite: async (latest) => {
          useConflictStore.getState().set(null);
          await save(latest);
        },
        reload: () => {
          useConflictStore.getState().set(null);
          setEditing(null);
          void refresh();
        },
      });
    } else {
      setError(r.message);
    }
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Editing story">
      <header className="flex items-center gap-2 border-y border-border px-4 py-2">
        <h2 className="mr-auto text-sm font-semibold">Editing story · {d.title}</h2>
        <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
        <Button size="sm" onClick={() => save()} disabled={!title.trim() || !!laneProblem}>Save</Button>
      </header>
      {(error || laneProblem) && <p className="border-b border-border px-4 py-1 text-xs text-destructive" role="alert">{error ?? `Lane "${laneProblem!.id}" needs a unique slug id and a label.`}</p>}
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <label className="text-xs text-muted-foreground">Title<input className={input} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label className="text-xs text-muted-foreground">Status
            <select className={input} value={status} onChange={(e) => setStatus(e.target.value as StoryStatus)}>{STORY_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
          </label>
          <label className="text-xs text-muted-foreground">Owner<input className={input} value={owner} onChange={(e) => setOwner(e.target.value)} /></label>
          <label className="text-xs text-muted-foreground">Tags (comma-separated)<input className={input} value={tags} onChange={(e) => setTags(e.target.value)} /></label>
        </div>
        <LanesEditor lanes={lanes} onChange={setLanes} />
        <div className="grid min-h-[16rem] grid-cols-1 gap-3 xl:grid-cols-2">
          <div className="h-72 overflow-hidden rounded-md border border-border">
            <Editor height="100%" language="markdown" value={body} onChange={(v) => setBody(v ?? '')} theme="vs-dark" options={{ minimap: { enabled: false }, fontSize: 13, lineNumbers: 'off', wordWrap: 'on', automaticLayout: true }} />
          </div>
          <div className="h-72 overflow-auto rounded-md border border-border p-3"><MarkdownContent content={body} /></div>
        </div>
      </div>
    </section>
  );
}

/** Lanes with label and kind; the id is derived from the label for new lanes and kept for existing ones. */
export function LanesEditor({ lanes, onChange }: { lanes: Lane[]; onChange: (lanes: Lane[]) => void }) {
  const set = (i: number, patch: Partial<Lane>) => onChange(lanes.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <section aria-label="Lanes" className="space-y-1">
      <h3 className="text-xs font-semibold uppercase text-muted-foreground">Lanes</h3>
      {lanes.map((lane, i) => (
        <div key={i} className="flex items-center gap-2">
          <input aria-label={`Lane ${i + 1} label`} className={`${input} w-48`} value={lane.label} onChange={(e) => set(i, { label: e.target.value })} />
          <input aria-label={`Lane ${i + 1} id`} className={`${input} w-40 font-mono text-xs`} value={lane.id} onChange={(e) => set(i, { id: e.target.value })} />
          <select aria-label={`Lane ${i + 1} kind`} className={`${input} w-32`} value={lane.kind} onChange={(e) => set(i, { kind: e.target.value as Lane['kind'] })}>
            {LANE_KINDS.map((k) => <option key={k}>{k}</option>)}
          </select>
          <Button variant="ghost" size="icon" aria-label={`Remove lane ${lane.label}`} onClick={() => onChange(lanes.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => onChange([...lanes, { id: `lane-${lanes.length + 1}`, label: '', kind: 'system' }])}><Plus className="mr-1 h-3.5 w-3.5" /> Add lane</Button>
    </section>
  );
}
