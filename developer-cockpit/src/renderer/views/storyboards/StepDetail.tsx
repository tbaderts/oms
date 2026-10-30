import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, LayoutGrid, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MarkdownContent } from '@/components/MarkdownContent';
import { useNavigationStore } from '@/stores/navigation';
import { useStoryboardsStore } from '@/stores/storyboards';
import type { ContinueAt, DataIn, DataOut, Illustration, LinkCategory, Origin, Step, StoryboardDetail } from '@shared/types/storyboards';
import { LINK_CATEGORIES } from '@shared/types/storyboards';
import { PlaceholderPanel } from './Sketch';

export const laneName = (d: StoryboardDetail, id?: string) => (id ? d.lanes.find((l) => l.id === id)?.label ?? id : '—');

export function continuationText(c: ContinueAt, d: StoryboardDetail, ownIndex: number): string {
  if (c.kind === 'stay') return `retry step ${ownIndex + 1}`;
  if (c.kind === 'end') return 'end of journey';
  const target = d.steps.find((s) => s.id === c.step);
  return target ? `continue at step ${target.index + 1} (${target.title})` : `continue at ${c.step}`;
}

export function originText(o: Origin, d: StoryboardDetail): string {
  if (o.kind === 'step') {
    const s = d.steps.find((x) => x.id === o.ref);
    return s ? `from step ${s.index + 1}` : `from ${o.ref}`;
  }
  if (o.kind === 'extension') return `from alternate path ${o.ref}`;
  if (o.kind === 'external') return 'lane' in o ? `external: ${laneName(d, o.lane)}` : `external: ${o.label}`;
  return 'source unknown';
}

const CATEGORY_LABEL: Record<LinkCategory, string> = { api: 'API', events: 'Event', states: 'State', requirements: 'Req' };

/** Link chips open the matching cockpit view: requirements → Requirements, API and events → Contracts, states → Knowledge Base. */
function openLink(category: LinkCategory) {
  const view = category === 'requirements' ? 'requirements' : category === 'states' ? 'knowledge-base' : 'contracts';
  useNavigationStore.getState().setActiveView(view);
}

export function IllustrationView({ ill, d, step }: { ill: Illustration; d: StoryboardDetail; step: Step }) {
  const [broken, setBroken] = useState(false);
  const usable = ill.url && !ill.missing && !broken;
  return (
    <figure className="rounded-md border border-border p-2">
      {usable ? (
        // Illustrations always go through <img>: an SVG is never injected into the page.
        <img src={ill.url!} alt={ill.caption ?? step.title} className="mx-auto max-h-80 w-full object-contain" onError={() => setBroken(true)} />
      ) : (
        <div className="h-48">
          <PlaceholderPanel from={laneName(d, step.from)} to={laneName(d, step.to)} title={`${ill.src} is not available`} />
        </div>
      )}
      <figcaption className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <span>{ill.caption}</span>
        {!ill.editable && <span className="ml-auto rounded border px-1 text-[10px]">not editable</span>}
      </figcaption>
    </figure>
  );
}

function DataList({ title, inputs, outputs, d }: { title: string; inputs: DataIn[]; outputs: DataOut[]; d: StoryboardDetail }) {
  if (!inputs.length && !outputs.length) return null;
  return (
    <section aria-label={title} className="text-sm">
      <h3 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{title}</h3>
      <ul className="space-y-0.5">
        {inputs.map((i) => (
          <li key={`in-${i.name}`}>
            <span className="text-sky-600 dark:text-sky-400">in</span> <strong>{i.name}</strong> {i.shape && <code className="text-xs">{i.shape}</code>} <span className="text-xs text-muted-foreground">— {originText(i.origin, d)}</span>
          </li>
        ))}
        {outputs.map((o) => (
          <li key={`out-${o.name}`}>
            <span className="text-emerald-600 dark:text-emerald-400">out</span> <strong>{o.name}</strong> {o.shape && <code className="text-xs">{o.shape}</code>} {o.final && <span className="text-xs text-muted-foreground">— leaves the journey</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** One step under the pinned overview: hand-off, illustrations beside the prose, links, data and alternate paths. */
export function StepDetail({ d, step }: { d: StoryboardDetail; step: Step }) {
  const writable = useStoryboardsStore((s) => !!s.scan?.writable);
  const { moveSelection, selectStep, setEditing } = useStoryboardsStore.getState();
  const links = LINK_CATEGORIES.flatMap((c) => step.links[c].map((v) => ({ c, v })));

  return (
    <article className="flex min-h-0 flex-1 flex-col" aria-label={`Step ${step.index + 1}`}>
      <header className="flex flex-wrap items-center gap-2 border-y border-border px-4 py-2">
        <div className="mr-auto min-w-0">
          <h2 className="truncate text-base font-semibold">
            <span className="text-muted-foreground">Step {step.index + 1} of {d.steps.length} ·</span> {step.title}
          </h2>
          <p className="text-xs text-muted-foreground" data-testid="handoff">
            {laneName(d, step.from)} → {laneName(d, step.to)} · {step.kind} step
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => moveSelection('prev')} disabled={step.index === 0} aria-label="Previous step"><ChevronLeft className="h-4 w-4" /> Prev</Button>
        <Button variant="ghost" size="sm" onClick={() => moveSelection('next')} disabled={step.index === d.steps.length - 1} aria-label="Next step">Next <ChevronRight className="h-4 w-4" /></Button>
        <Button variant="ghost" size="sm" onClick={() => selectStep(null)} aria-label="Overview"><LayoutGrid className="h-4 w-4" /></Button>
        {writable && step.readable && <Button variant="outline" size="sm" onClick={() => setEditing({ kind: 'step', stepId: step.id })}><Pencil className="mr-1 h-3.5 w-3.5" /> Edit</Button>}
      </header>

      {!step.readable ? (
        <p className="p-4 text-sm text-destructive">This step cannot be read: {step.unreadableReason}.</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 xl:flex-row xl:overflow-hidden">
          <div className="space-y-3 xl:w-1/2 xl:overflow-auto" data-testid="step-illustrations">
            {step.illustrations.length ? step.illustrations.map((ill) => <IllustrationView key={ill.src} ill={ill} d={d} step={step} />) : (
              <div className="h-48 rounded-md border border-dashed border-border"><PlaceholderPanel from={laneName(d, step.from)} to={laneName(d, step.to)} title={step.title} /></div>
            )}
            {links.length > 0 && (
              <div className="flex flex-wrap gap-1" aria-label="Links">
                {links.map(({ c, v }) => (
                  <button key={`${c}:${v}`} type="button" onClick={() => openLink(c)} className="rounded-full border border-border px-2 py-0.5 text-xs hover:bg-accent" title={`Open in ${c === 'requirements' ? 'Requirements' : c === 'states' ? 'Knowledge Base' : 'Contracts'}`}>
                    <span className="text-muted-foreground">{CATEGORY_LABEL[c]}</span> {v}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="min-w-0 space-y-4 xl:w-1/2 xl:overflow-auto" data-testid="step-prose">
            <MarkdownContent content={step.body} />
            <DataList title="Data" inputs={step.in} outputs={step.out} d={d} />
            {step.extensions.length > 0 && (
              <section aria-label="Alternate paths">
                <h3 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Alternate paths</h3>
                {step.extensions.map((e) => (
                  <div key={e.id} className="mb-2 rounded-md border-l-4 border-amber-500/60 bg-muted/40 p-2 text-sm">
                    <p><strong>{e.label}</strong> <span className="text-muted-foreground">When</span> {e.when}</p>
                    <p><span className="text-muted-foreground">Then</span> {e.then}</p>
                    <p className="text-xs text-muted-foreground">→ {continuationText(e.continueAt, d, step.index)}</p>
                    {e.illustrations.map((ill) => <IllustrationView key={ill.src} ill={ill} d={d} step={step} />)}
                    <DataList title={`Data of ${e.label}`} inputs={e.in} outputs={e.out} d={d} />
                  </div>
                ))}
              </section>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
