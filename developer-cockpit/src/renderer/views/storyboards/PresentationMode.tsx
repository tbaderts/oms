import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { MarkdownContent } from '@/components/MarkdownContent';
import { cn } from '@/lib/utils';
import { sectionOf } from '@shared/storyboards/sections';
import { useStoryboardsStore } from '@/stores/storyboards';
import { PlaceholderPanel } from './Sketch';
import { continuationText, laneName, originText } from './StepDetail';

const toggle = (on: boolean) => cn('rounded border px-2 py-0.5 text-xs', on ? 'border-primary bg-primary/15 text-primary' : 'border-border');

/**
 * An in-app overlay for workshops (no browser fullscreen): title, a large illustration, only the
 * step's "What happens", a slim progress bar, arrow keys to move, Escape to leave. D shows the
 * step's data, A its alternate paths with their own sketches.
 */
export function PresentationMode() {
  const d = useStoryboardsStore((s) => s.detail)!;
  const selectedStepId = useStoryboardsStore((s) => s.selectedStepId);
  const { moveSelection, setPresenting, selectStep } = useStoryboardsStore.getState();
  // The same layers as the reader: switching one here switches it there too.
  const showData = useStoryboardsStore((s) => s.layers.data);
  const showExtensions = useStoryboardsStore((s) => s.layers.extensions);
  const { toggleLayer } = useStoryboardsStore.getState();
  const step = d.steps.find((s) => s.id === selectedStepId) ?? d.steps[0];
  const storyHasData = d.steps.some((s) => s.in.length || s.out.length);
  const storyHasExtensions = d.steps.some((s) => s.extensions.length);

  useEffect(() => {
    if (!selectedStepId && d.steps[0]) selectStep(d.steps[0].id);
  }, [selectedStepId, d, selectStep]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const keys: Record<string, () => void> = {
        ArrowRight: () => moveSelection('next'),
        ArrowDown: () => moveSelection('next'),
        ' ': () => moveSelection('next'),
        ArrowLeft: () => moveSelection('prev'),
        ArrowUp: () => moveSelection('prev'),
        Home: () => moveSelection('first'),
        End: () => moveSelection('last'),
        Escape: () => setPresenting(false),
        a: () => toggleLayer('extensions'),
        d: () => toggleLayer('data'),
      };
      const action = keys[e.key];
      if (!action) return;
      // Registered in the capture phase; the reader's own key handler must not see these keys too.
      e.preventDefault();
      e.stopImmediatePropagation();
      action();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [moveSelection, setPresenting, toggleLayer]);

  if (!step) return null;
  const ill = step.illustrations.find((i) => i.url && !i.missing);
  const whatHappens = sectionOf(step.body, 'What happens');

  return (
    <div role="dialog" aria-modal="true" aria-label={`Presenting ${d.title}`} className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex items-center gap-3 px-8 py-4">
        <h1 className="mr-auto text-xl font-semibold">{d.title}</h1>
        {storyHasData && (
          <button type="button" className={toggle(showData)} onClick={() => toggleLayer('data')} aria-pressed={showData}>
            Data (D)
          </button>
        )}
        {storyHasExtensions && (
          <button type="button" className={toggle(showExtensions)} onClick={() => toggleLayer('extensions')} aria-pressed={showExtensions}>
            Alternate paths (A)
          </button>
        )}
        <button type="button" onClick={() => setPresenting(false)} aria-label="Exit presentation" className="rounded p-1 hover:bg-accent"><X className="h-5 w-5" /></button>
      </header>
      <div className="flex min-h-0 flex-1 gap-8 px-8">
        <div className="flex min-w-0 flex-[3] items-center justify-center">
          {ill ? (
            <img src={ill.url!} alt={ill.caption ?? step.title} className="max-h-full max-w-full object-contain" />
          ) : (
            <div className="h-80 w-full max-w-2xl rounded-lg border border-dashed border-border text-base">
              <PlaceholderPanel from={laneName(d, step.from)} to={laneName(d, step.to)} title={step.title} />
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-[2] flex-col justify-center overflow-auto text-lg">
          <p className="text-sm text-muted-foreground">Step {step.index + 1} of {d.steps.length} · {laneName(d, step.from)} → {laneName(d, step.to)}</p>
          <h2 className="mb-4 text-3xl font-semibold">{step.title}</h2>
          <div data-testid="what-happens">{whatHappens ? <MarkdownContent content={whatHappens} /> : <p className="text-muted-foreground">No “What happens” section yet.</p>}</div>
          {showData && (
            <div className="mt-6 space-y-1 text-base" data-testid="presentation-data">
              {step.in.length === 0 && step.out.length === 0 && <p className="text-sm text-muted-foreground">No data annotated on this step.</p>}
              {step.in.map((i) => (
                <p key={`in-${i.name}`}>
                  <span className="mr-2 rounded bg-sky-500/20 px-1.5 text-sm">in</span>
                  <strong>{i.name}</strong> <span className="text-sm text-muted-foreground">— {originText(i.origin, d)}</span>
                  {i.shape && <code className="ml-2 text-sm text-muted-foreground">{i.shape}</code>}
                </p>
              ))}
              {step.out.map((o) => (
                <p key={`out-${o.name}`}>
                  <span className="mr-2 rounded bg-emerald-500/20 px-1.5 text-sm">out</span>
                  <strong>{o.name}</strong>
                  {o.final && <span className="text-sm text-muted-foreground"> — leaves the journey</span>}
                  {o.shape && <code className="ml-2 text-sm text-muted-foreground">{o.shape}</code>}
                </p>
              ))}
            </div>
          )}
          {showExtensions && step.extensions.length === 0 && (
            <p className="mt-6 text-sm text-muted-foreground" data-testid="presentation-extensions">No alternate paths on this step.</p>
          )}
        </div>
      </div>
      {showExtensions && step.extensions.length > 0 && (
        <div className="flex max-h-[38vh] shrink-0 gap-4 overflow-x-auto px-8 pt-4" data-testid="presentation-extensions">
          {step.extensions.map((e) => {
            const sketch = e.illustrations.find((i) => i.url && !i.missing);
            return (
              <figure key={e.id} className="flex min-w-[22rem] max-w-[36rem] flex-1 flex-col rounded-lg border-l-4 border-amber-500/70 bg-muted/40 p-3">
                {sketch && <img src={sketch.url!} alt={sketch.caption ?? e.when} className="mb-2 max-h-[22vh] w-full rounded bg-white object-contain p-1" />}
                <figcaption className="text-base">
                  <strong>{e.label}</strong> <span className="text-sm text-muted-foreground">When</span> {e.when}
                  <span className="block"><span className="text-sm text-muted-foreground">Then</span> {e.then}</span>
                  <span className="block text-sm text-muted-foreground">→ {continuationText(e.continueAt, d, step.index)}</span>
                </figcaption>
              </figure>
            );
          })}
        </div>
      )}
      <nav aria-label="Progress" className="flex gap-1 px-8 py-4">
        {d.steps.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-label={`Go to step ${s.index + 1}`}
            aria-current={s.id === step.id ? 'step' : undefined}
            onClick={() => selectStep(s.id)}
            className={cn('h-1.5 flex-1 rounded-full', s.index <= step.index ? 'bg-primary' : 'bg-muted')}
          />
        ))}
      </nav>
    </div>
  );
}
