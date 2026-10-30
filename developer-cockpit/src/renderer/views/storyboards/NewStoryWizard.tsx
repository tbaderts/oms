import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isDomain, slugify } from '@shared/storyboards/ids';
import type { Lane } from '@shared/types/storyboards';
import { useStoryboardsStore } from '@/stores/storyboards';
import { LanesEditor } from './StoryEditor';

const input = 'w-full rounded-md border border-input bg-background px-2 py-1 text-sm';

/** New storyboard: target root (from the scan), domain, title, lanes and at least one step title. */
export function NewStoryWizard() {
  const scan = useStoryboardsStore((s) => s.scan);
  const { setEditing, refresh, open } = useStoryboardsStore.getState();
  const roots = scan?.roots ?? [];
  const [rootId, setRootId] = useState(roots[0]?.rootId ?? '');
  const [domain, setDomain] = useState('');
  const [title, setTitle] = useState('');
  const [lanes, setLanes] = useState<Lane[]>([{ id: 'customer', label: 'Customer', kind: 'actor' }, { id: 'oms', label: 'OMS', kind: 'system' }]);
  const [steps, setSteps] = useState<string[]>(['']);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // New lanes get their id from the label as the author types.
  const editLanes = (next: Lane[]) => setLanes(next.map((l, i) => (lanes[i] && lanes[i].id === slugify(lanes[i].label) && l.label !== lanes[i].label ? { ...l, id: slugify(l.label) || l.id } : l)));
  const stepTitles = steps.map((s) => s.trim()).filter(Boolean);
  const problems = [
    !rootId && 'Choose a root.',
    !isDomain(domain) && 'The domain must be lowercase words separated by dashes (and / for nesting).',
    !slugify(title) && 'Give the storyboard a title.',
    !lanes.length && 'Add at least one lane.',
    !stepTitles.length && 'Add at least one step title.',
  ].filter((p): p is string => !!p);

  const create = async () => {
    setBusy(true);
    setError(null);
    const r = await window.cockpit.storyboards.create({ rootId, domain, title: title.trim(), lanes, stepTitles });
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setEditing(null);
    await refresh();
    await open(r.id);
  };

  return (
    <section className="flex h-full flex-col" aria-label="New storyboard">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2">
        <h1 className="mr-auto text-lg font-semibold">New storyboard</h1>
        <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
        <Button size="sm" onClick={create} disabled={busy || problems.length > 0}>{busy ? 'Creating…' : 'Create'}</Button>
      </header>
      <div className="flex-1 space-y-4 overflow-auto p-4">
        {(error || problems.length > 0) && (
          <div className="text-xs text-muted-foreground" role="status">{error && <p className="text-destructive">{error}</p>}{problems.map((p) => <p key={p}>{p}</p>)}</div>
        )}
        <div className="grid max-w-3xl grid-cols-1 gap-3 xl:grid-cols-3">
          <label className="text-xs text-muted-foreground">Root
            <select aria-label="Root" className={input} value={rootId} onChange={(e) => setRootId(e.target.value)}>
              {roots.map((r) => <option key={r.rootId} value={r.rootId}>{r.label}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">Domain<input aria-label="Domain" placeholder="order-lifecycle" className={input} value={domain} onChange={(e) => setDomain(e.target.value)} /></label>
          <label className="text-xs text-muted-foreground">Title<input aria-label="Title" className={input} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        </div>
        <LanesEditor lanes={lanes} onChange={editLanes} />
        <section aria-label="Steps" className="max-w-xl space-y-1">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">Steps</h3>
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-5 text-xs text-muted-foreground">{i + 1}</span>
              <input aria-label={`Step ${i + 1} title`} className={input} value={s} onChange={(e) => setSteps(steps.map((x, j) => (j === i ? e.target.value : x)))} />
              <Button variant="ghost" size="icon" aria-label={`Remove step ${i + 1}`} disabled={steps.length === 1} onClick={() => setSteps(steps.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setSteps([...steps, ''])}><Plus className="mr-1 h-3.5 w-3.5" /> Add step</Button>
        </section>
      </div>
    </section>
  );
}
