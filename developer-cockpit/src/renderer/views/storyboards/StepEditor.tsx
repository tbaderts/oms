import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import '@/lib/monaco';
import { Brush, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MarkdownContent } from '@/components/MarkdownContent';
import { SLUG, assetStem } from '@shared/storyboards/ids';
import {
  LINK_CATEGORIES,
  STEP_KINDS,
  type ContinueAt,
  type DataIn,
  type DataOut,
  type LinkCategory,
  type Origin,
  type Step,
  type StepKind,
  type StepLinks,
  type StoredExtension,
  type StoredIllustration,
  type StoryboardDetail,
} from '@shared/types/storyboards';
import { useStoryboardsStore } from '@/stores/storyboards';
import { saveStepGuarded } from './useStoryboardEdits';
import { AiAssistMenu } from './AiAssistMenu';
import { draftKey, draftOf, patchFromDraft, type StepDraft } from './stepDraft';

// Excalidraw is large: it loads only when a sketch is drawn or edited (SPEC-0014 AC-15).
const IllustrationEditor = lazy(() => import('./IllustrationEditor'));

export { draftKey, draftOf, type StepDraft } from './stepDraft';

function loadDraft(storyId: string, step: Step): StepDraft {
  try {
    const saved = sessionStorage.getItem(draftKey(storyId, step.id));
    if (saved) return { ...draftOf(step), ...(JSON.parse(saved) as StepDraft) };
  } catch {
    // no session storage, or a broken draft: start from the file
  }
  return draftOf(step);
}

function clearDraft(storyId: string, stepId: string) {
  try {
    sessionStorage.removeItem(draftKey(storyId, stepId));
  } catch {
    // ignore
  }
}

/** Problems the editor itself prevents before saving (the service validates again). */
export function draftErrors(draft: StepDraft, d: StoryboardDetail, stepIndex: number): string[] {
  const errors: string[] = [];
  if (!draft.title.trim()) errors.push('The title is empty.');
  const ids = draft.extensions.map((e) => e.id);
  ids.forEach((id, i) => {
    if (!SLUG.test(id)) errors.push(`Alternate path id "${id}" must be lowercase letters, digits and dashes.`);
    else if (ids.indexOf(id) !== i) errors.push(`Alternate path id "${id}" is used twice.`);
  });
  draft.extensions.forEach((e) => {
    if (!e.when.trim() || !e.then.trim()) errors.push(`Alternate path "${e.id}" needs both When and Then.`);
    if (e.continueAt.kind === 'step' && !d.steps.some((s) => s.id === (e.continueAt as { step: string }).step && s.index > stepIndex)) {
      errors.push(`Alternate path "${e.id}" may only continue at a later step.`);
    }
  });
  return errors;
}

type Sketch = { name: string; svg: string | null; attach: (src: string) => void };

/** The structured editor over one step file: everything is a draft until the explicit Save. */
export function StepEditor({ d, stepId }: { d: StoryboardDetail; stepId: string }) {
  const step = d.steps.find((s) => s.id === stepId)!;
  const links = useStoryboardsStore((s) => s.links);
  const aiAvailable = useStoryboardsStore((s) => s.aiAvailable);
  const { setEditing, selectStep, loadLinks } = useStoryboardsStore.getState();
  const [draft, setDraft] = useState<StepDraft>(() => loadDraft(d.id, step));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sketch, setSketch] = useState<Sketch | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  // Unsaved work lives in session storage only; the repository changes on Save.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        sessionStorage.setItem(draftKey(d.id, step.id), JSON.stringify(draft));
      } catch {
        // drafts are a convenience
      }
    }, 500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [draft, d.id, step.id]);

  const update = (patch: Partial<StepDraft>) => setDraft((prev) => ({ ...prev, ...patch }));
  const problems = useMemo(() => draftErrors(draft, d, step.index), [draft, d, step.index]);
  const earlier = d.steps.filter((s) => s.index < step.index);
  const later = d.steps.filter((s) => s.index > step.index);
  const usedNames = new Set(d.steps.flatMap((s) => [...s.illustrations, ...s.extensions.flatMap((e) => e.illustrations)].map((i) => i.src)));
  draft.illustrations.forEach((i) => usedNames.add(i.src));
  draft.extensions.forEach((e) => e.illustrations?.forEach((i) => usedNames.add(i.src)));
  const newSketchName = (extensionId?: string) => {
    for (let n = 1; ; n++) {
      const name = `${assetStem(step.id, extensionId, n)}.excalidraw.svg`;
      if (!usedNames.has(name)) return name;
    }
  };

  const close = () => {
    setEditing(null);
    selectStep(step.id);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    // Only what the user changed: untouched keys stay byte for byte as they are in the file.
    const { patch, body } = patchFromDraft(step, draft);
    const r = await saveStepGuarded(d, step.id, patch, body, step.revision, {
      onSaved: () => {
        clearDraft(d.id, step.id);
        close();
      },
      onReload: () => clearDraft(d.id, step.id),
    });
    setSaving(false);
    if (!r.ok && r.code !== 'conflict') setError(r.message);
  };

  const cancel = () => {
    clearDraft(d.id, step.id);
    close();
  };

  const [removing, setRemoving] = useState(false);
  const [deleteFiles, setDeleteFiles] = useState(false);
  const remove = async () => {
    const r = await window.cockpit.storyboards.deleteStep(d.id, step.id, deleteFiles, d.revision);
    if (!r.ok) {
      setError(r.code === 'conflict' ? 'story.md changed on disk; reload the storyboard and try again.' : r.message);
      return;
    }
    clearDraft(d.id, step.id);
    setEditing(null);
    selectStep(null);
    await useStoryboardsStore.getState().refresh();
  };

  /** Opens the sketch editor; a new or changed sketch is saved as an asset at once, referenced on step Save. */
  const openSketch = async (name: string, existing: boolean, attach: (src: string) => void) => {
    let svg: string | null = null;
    if (existing) {
      const r = await window.cockpit.storyboards.readIllustration(d.id, name);
      if (!r.ok) {
        setError(r.message);
        return;
      }
      svg = r.svg;
    }
    setSketch({ name, svg, attach });
  };

  const [library, setLibrary] = useState<string | null>(null);
  useEffect(() => {
    if (!sketch) return;
    window.cockpit.storyboards.library(d.id).then((r) => setLibrary(r.ok ? r.library : null));
  }, [sketch, d.id]);

  if (sketch) {
    return (
      <div className="flex min-h-0 flex-1 flex-col" aria-label="Sketch editor">
        <Suspense fallback={<p className="p-4 text-xs text-muted-foreground">Loading the sketch editor…</p>}>
          <IllustrationEditor
            initialSvg={sketch.svg}
            library={library}
            onCancel={() => setSketch(null)}
            onSave={async (svg) => {
              const r = await window.cockpit.storyboards.saveIllustration(d.id, sketch.name, svg);
              if (!r.ok) {
                setError(r.message);
                return;
              }
              sketch.attach(sketch.name);
              setSketch(null);
            }}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label={`Editing step ${step.index + 1}`}>
      <header className="flex flex-wrap items-center gap-2 border-y border-border px-4 py-2">
        <h2 className="mr-auto text-sm font-semibold">Editing step {step.index + 1} · {step.title}</h2>
        {aiAvailable && (
          <AiAssistMenu
            storyId={d.id}
            stepId={step.id}
            onProse={(markdown) => update({ body: markdown })}
            onLinks={(l) => update({ links: mergeLinks(draft.links, l) })}
            onExtension={(e) => update({ extensions: [...draft.extensions, { id: uniqueExtensionId(draft.extensions, e.when), ...e }] })}
          />
        )}
        <Button variant="ghost" size="sm" onClick={() => setRemoving(true)}><Trash2 className="mr-1 h-3.5 w-3.5" /> Remove step</Button>
        <Button variant="ghost" size="sm" onClick={cancel}>Cancel</Button>
        <Button size="sm" onClick={save} disabled={saving || problems.length > 0}>{saving ? 'Saving…' : 'Save'}</Button>
      </header>
      {removing && (
        <div role="group" aria-label="Remove step" className="flex flex-wrap items-center gap-3 border-b border-border bg-destructive/5 px-4 py-2 text-sm">
          <span>Remove “{step.title}” from the journey?</span>
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={deleteFiles} onChange={(e) => setDeleteFiles(e.target.checked)} />
            Also delete the step file and the sketches only this step uses
          </label>
          <span className="text-xs text-muted-foreground">{deleteFiles ? 'This cannot be undone outside git.' : 'The file stays on disk and shows up as an orphan, so it can be re-added.'}</span>
          <Button variant="ghost" size="sm" onClick={() => setRemoving(false)}>Keep</Button>
          <Button variant="destructive" size="sm" onClick={remove}>Remove</Button>
        </div>
      )}
      {(error || problems.length > 0) && (
        <div className="border-b border-border px-4 py-1 text-xs text-destructive" role="alert">
          {error && <p>{error}</p>}
          {problems.map((p) => <p key={p}>{p}</p>)}
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Field label="Title"><input className={input} value={draft.title} onChange={(e) => update({ title: e.target.value })} /></Field>
          <Field label="Kind">
            <select className={input} value={draft.kind} onChange={(e) => update({ kind: e.target.value as StepKind })}>
              {STEP_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </Field>
          <Field label="From lane"><LaneSelect d={d} value={draft.from} onChange={(from) => update({ from })} /></Field>
          <Field label="To lane"><LaneSelect d={d} value={draft.to} onChange={(to) => update({ to })} /></Field>
        </div>

        <IllustrationList
          items={draft.illustrations}
          onChange={(illustrations) => update({ illustrations })}
          onDraw={() => openSketch(newSketchName(), false, (src) => setDraft((prev) => ({ ...prev, illustrations: [...prev.illustrations, { src }] })))}
          onEdit={(src) => openSketch(src, true, () => undefined)}
        />

        <div className="grid min-h-[16rem] grid-cols-1 gap-3 xl:grid-cols-2">
          <div className="h-72 overflow-hidden rounded-md border border-border">
            <Editor height="100%" language="markdown" value={draft.body} onChange={(v) => update({ body: v ?? '' })} theme="vs-dark"
              options={{ minimap: { enabled: false }, fontSize: 13, lineNumbers: 'off', wordWrap: 'on', scrollBeyondLastLine: false, automaticLayout: true }} />
          </div>
          <div role="region" className="h-72 overflow-auto rounded-md border border-border p-3" aria-label="Preview"><MarkdownContent content={draft.body} /></div>
        </div>

        <LinkPicker links={draft.links} candidates={links} onChange={(l) => update({ links: l })} />

        <DataEditor
          d={d}
          inputs={draft.in}
          outputs={draft.out}
          earlier={earlier}
          onChange={(inputs, outputs) => update({ in: inputs, out: outputs })}
        />

        <section aria-label="Alternate paths editor" className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">Alternate paths</h3>
            <Button variant="outline" size="sm" onClick={() => update({ extensions: [...draft.extensions, { id: uniqueExtensionId(draft.extensions, 'alternate'), when: '', then: '', continueAt: { kind: 'end' } }] })}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add alternate path
            </Button>
          </div>
          {draft.extensions.map((ext, i) => {
            const set = (patch: Partial<StoredExtension>) => update({ extensions: draft.extensions.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
            return (
              <div key={i} role="group" className="space-y-2 rounded-md border border-border p-2" aria-label={`Alternate path ${i + 1}`}>
                <div className="grid grid-cols-1 gap-2 xl:grid-cols-[10rem_1fr_1fr_12rem_auto]">
                  <input aria-label="Alternate path id" className={input} value={ext.id} onChange={(e) => set({ id: e.target.value })} />
                  <input aria-label="When" placeholder="When…" className={input} value={ext.when} onChange={(e) => set({ when: e.target.value })} />
                  <input aria-label="Then" placeholder="Then…" className={input} value={ext.then} onChange={(e) => set({ then: e.target.value })} />
                  <select aria-label="Continues at" className={input} value={continueValue(ext.continueAt)} onChange={(e) => set({ continueAt: parseContinue(e.target.value) })}>
                    <option value="stay">Retry this step</option>
                    <option value="end">End of journey</option>
                    {later.map((s) => <option key={s.id} value={`step:${s.id}`}>Continue at {s.index + 1}. {s.title}</option>)}
                  </select>
                  <Button variant="ghost" size="icon" aria-label={`Remove alternate path ${ext.id}`} onClick={() => update({ extensions: draft.extensions.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
                </div>
                <IllustrationList
                  items={ext.illustrations ?? []}
                  onChange={(illustrations) => set({ illustrations })}
                  onDraw={() => openSketch(newSketchName(SLUG.test(ext.id) ? ext.id : undefined), false, (src) =>
                    setDraft((prev) => ({ ...prev, extensions: prev.extensions.map((e, j) => (j === i ? { ...e, illustrations: [...(e.illustrations ?? []), { src }] } : e)) })))}
                  onEdit={(src) => openSketch(src, true, () => undefined)}
                  compact
                />
                <DataEditor d={d} inputs={ext.in ?? []} outputs={ext.out ?? []} earlier={[...earlier, step]} onChange={(inputs, outputs) => set({ in: inputs, out: outputs })} compact />
              </div>
            );
          })}
        </section>
      </div>
    </section>
  );
}

const input = 'w-full rounded-md border border-input bg-background px-2 py-1 text-sm';

function mergeLinks(a: StepLinks, b: StepLinks): StepLinks {
  const merged = { ...a };
  for (const c of LINK_CATEGORIES) merged[c] = [...new Set([...a[c], ...b[c]])];
  return merged;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs text-muted-foreground">
      <span className="mb-0.5 block">{label}</span>
      {children}
    </label>
  );
}

function LaneSelect({ d, value, onChange }: { d: StoryboardDetail; value: string; onChange: (v: string) => void }) {
  return (
    <select className={input} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— none —</option>
      {d.lanes.map((l) => <option key={l.id} value={l.id}>{l.label} ({l.kind})</option>)}
      {value && !d.lanes.some((l) => l.id === value) && <option value={value}>{value} (undeclared)</option>}
    </select>
  );
}

function uniqueExtensionId(existing: StoredExtension[], seed: string): string {
  const base = seed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'alternate';
  let id = base;
  for (let n = 2; existing.some((e) => e.id === id); n++) id = `${base}-${n}`;
  return id;
}

const continueValue = (c: ContinueAt) => (c.kind === 'step' ? `step:${c.step}` : c.kind);
const parseContinue = (v: string): ContinueAt => (v.startsWith('step:') ? { kind: 'step', step: v.slice(5) } : { kind: v === 'stay' ? 'stay' : 'end' });

function IllustrationList({ items, onChange, onDraw, onEdit, compact }: { items: StoredIllustration[]; onChange: (items: StoredIllustration[]) => void; onDraw: () => void; onEdit: (src: string) => void; compact?: boolean }) {
  return (
    <section aria-label="Illustrations" className="space-y-1">
      {!compact && <h3 className="text-xs font-semibold uppercase text-muted-foreground">Illustrations</h3>}
      {items.map((ill, i) => (
        <div key={ill.src} className="flex items-center gap-2 text-sm">
          <code className="text-xs">{ill.src}</code>
          <input aria-label={`Caption of ${ill.src}`} placeholder="Caption" className={`${input} flex-1`} value={ill.caption ?? ''} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, caption: e.target.value || undefined } : x)))} />
          {ill.src.endsWith('.excalidraw.svg') && <Button variant="ghost" size="sm" onClick={() => onEdit(ill.src)}><Brush className="mr-1 h-3.5 w-3.5" /> Edit</Button>}
          <Button variant="ghost" size="icon" aria-label={`Remove ${ill.src}`} onClick={() => onChange(items.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={onDraw}><Brush className="mr-1 h-3.5 w-3.5" /> Draw sketch</Button>
    </section>
  );
}

function LinkPicker({ links, candidates, onChange }: { links: StepLinks; candidates: StepLinks | null; onChange: (l: StepLinks) => void }) {
  const [entry, setEntry] = useState<Record<LinkCategory, string>>({ api: '', events: '', states: '', requirements: '' });
  const add = (c: LinkCategory) => {
    const v = entry[c].trim();
    if (!v || links[c].includes(v)) return;
    onChange({ ...links, [c]: [...links[c], v] });
    setEntry({ ...entry, [c]: '' });
  };
  return (
    <section aria-label="Links editor" className="space-y-1">
      <h3 className="text-xs font-semibold uppercase text-muted-foreground">Links</h3>
      {LINK_CATEGORIES.map((c) => (
        <div key={c} className="flex flex-wrap items-center gap-1 text-sm">
          <span className="w-24 text-xs text-muted-foreground">{c}</span>
          {links[c].map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full border border-border px-2 text-xs">
              {v}
              {candidates && candidates[c].length > 0 && !candidates[c].includes(v) && <span className="text-amber-500" title="Not found in the workspace index">?</span>}
              <button type="button" aria-label={`Remove ${c} link ${v}`} onClick={() => onChange({ ...links, [c]: links[c].filter((x) => x !== v) })}><X className="h-3 w-3" /></button>
            </span>
          ))}
          <input
            aria-label={`Add ${c} link`}
            list={`sb-links-${c}`}
            className="w-56 rounded-md border border-input bg-background px-2 py-0.5 text-xs"
            value={entry[c]}
            onChange={(e) => setEntry({ ...entry, [c]: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add(c))}
          />
          <datalist id={`sb-links-${c}`}>{(candidates?.[c] ?? []).map((v) => <option key={v} value={v} />)}</datalist>
          <Button variant="ghost" size="sm" onClick={() => add(c)} aria-label={`Add ${c}`}><Plus className="h-3.5 w-3.5" /></Button>
        </div>
      ))}
    </section>
  );
}

const originValue = (o: Origin) => (o.kind === 'step' || o.kind === 'extension' ? `${o.kind}:${o.ref}` : o.kind === 'external' ? ('lane' in o ? `lane:${o.lane}` : 'label') : 'unknown');

function DataEditor({ d, inputs, outputs, earlier, onChange, compact }: { d: StoryboardDetail; inputs: DataIn[]; outputs: DataOut[]; earlier: Step[]; onChange: (i: DataIn[], o: DataOut[]) => void; compact?: boolean }) {
  const earlierOutputs = earlier.flatMap((s) => [
    ...s.out.map((o) => ({ name: o.name, origin: { kind: 'step' as const, ref: s.id }, label: `${o.name} (step ${s.index + 1})` })),
    ...s.extensions.flatMap((e) => e.out.map((o) => ({ name: o.name, origin: { kind: 'extension' as const, ref: `${s.id}/${e.id}` }, label: `${o.name} (${e.label})` }))),
  ]);
  const setIn = (i: number, patch: Partial<DataIn>) => onChange(inputs.map((x, j) => (j === i ? { ...x, ...patch } : x)), outputs);
  const setOut = (i: number, patch: Partial<DataOut>) => onChange(inputs, outputs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <section aria-label={compact ? 'Alternate path data' : 'Data editor'} className="space-y-1 text-sm">
      {!compact && <h3 className="text-xs font-semibold uppercase text-muted-foreground">Data</h3>}
      {inputs.map((inp, i) => (
        <div key={`in-${i}`} className="flex flex-wrap items-center gap-1">
          <span className="w-8 text-xs text-sky-600">in</span>
          <input aria-label="Input name" className="w-40 rounded-md border border-input bg-background px-2 py-0.5 text-xs" value={inp.name} onChange={(e) => setIn(i, { name: e.target.value })} />
          <input aria-label="Input shape" placeholder="{ shape }" className="w-40 rounded-md border border-input bg-background px-2 py-0.5 text-xs" value={inp.shape ?? ''} onChange={(e) => setIn(i, { shape: e.target.value || undefined })} />
          <select
            aria-label="Input source"
            className="rounded-md border border-input bg-background px-1 py-0.5 text-xs"
            value={originValue(inp.origin)}
            onChange={(e) => {
              const v = e.target.value;
              const origin: Origin = v === 'unknown' ? { kind: 'unknown' } : v === 'label' ? { kind: 'external', label: 'unspecified' }
                : v.startsWith('lane:') ? { kind: 'external', lane: v.slice(5) } : v.startsWith('extension:') ? { kind: 'extension', ref: v.slice(10) } : { kind: 'step', ref: v.slice(5) };
              setIn(i, { origin });
            }}
          >
            <option value="unknown">source unknown</option>
            {earlier.map((s) => <option key={s.id} value={`step:${s.id}`}>step {s.index + 1}: {s.title}</option>)}
            {earlier.flatMap((s) => s.extensions.map((e) => <option key={`${s.id}/${e.id}`} value={`extension:${s.id}/${e.id}`}>alternate path {e.label}</option>))}
            {d.lanes.filter((l) => l.kind === 'external' || l.kind === 'system').map((l) => <option key={l.id} value={`lane:${l.id}`}>external: {l.label}</option>)}
            <option value="label">external: other</option>
          </select>
          {inp.origin.kind === 'external' && 'label' in inp.origin && (
            <input aria-label="External source" className="w-32 rounded-md border border-input bg-background px-2 py-0.5 text-xs" value={inp.origin.label} onChange={(e) => setIn(i, { origin: { kind: 'external', label: e.target.value } })} />
          )}
          <Button variant="ghost" size="icon" aria-label={`Remove input ${inp.name}`} onClick={() => onChange(inputs.filter((_, j) => j !== i), outputs)}><X className="h-3.5 w-3.5" /></Button>
        </div>
      ))}
      {outputs.map((out, i) => (
        <div key={`out-${i}`} className="flex flex-wrap items-center gap-1">
          <span className="w-8 text-xs text-emerald-600">out</span>
          <input aria-label="Output name" className="w-40 rounded-md border border-input bg-background px-2 py-0.5 text-xs" value={out.name} onChange={(e) => setOut(i, { name: e.target.value })} />
          <input aria-label="Output shape" placeholder="{ shape }" className="w-40 rounded-md border border-input bg-background px-2 py-0.5 text-xs" value={out.shape ?? ''} onChange={(e) => setOut(i, { shape: e.target.value || undefined })} />
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={!!out.final} onChange={(e) => setOut(i, { final: e.target.checked || undefined })} /> leaves the journey</label>
          <Button variant="ghost" size="icon" aria-label={`Remove output ${out.name}`} onClick={() => onChange(inputs, outputs.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></Button>
        </div>
      ))}
      <div className="flex flex-wrap gap-1">
        <Button variant="outline" size="sm" onClick={() => onChange([...inputs, { name: 'Input', origin: { kind: 'unknown' } }], outputs)}><Plus className="mr-1 h-3 w-3" /> Input</Button>
        {earlierOutputs.length > 0 && (
          <select
            aria-label="Add input from an earlier output"
            className="rounded-md border border-input bg-background px-1 py-0.5 text-xs"
            value=""
            onChange={(e) => {
              const pick = earlierOutputs[Number(e.target.value)];
              if (pick) onChange([...inputs, { name: pick.name, origin: pick.origin }], outputs);
            }}
          >
            <option value="">+ input from an earlier output…</option>
            {earlierOutputs.map((o, i) => <option key={o.label} value={i}>{o.label}</option>)}
          </select>
        )}
        <Button variant="outline" size="sm" onClick={() => onChange(inputs, [...outputs, { name: 'Output' }])}><Plus className="mr-1 h-3 w-3" /> Output</Button>
      </div>
    </section>
  );
}
