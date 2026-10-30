import React, { Suspense, lazy, useState } from 'react';
import { FileDown, Pencil, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { renderMermaidSvg } from '@/components/MermaidDiagram';
import { cn } from '@/lib/utils';
import { toMermaid } from '@shared/storyboards/mermaid';
import type { StoryboardDetail } from '@shared/types/storyboards';
import { useStoryboardsStore, type OverviewMode } from '@/stores/storyboards';
import { DriftBadge, StatusBadge, TrustBadge } from './badges';
import { LanesOverview, SequenceOverview, StripOverview } from './Overviews';
import { ChecksPanel, ProvenancePanel } from './Panels';
import { StepDetail } from './StepDetail';
import { useQuickFixes, useStructureEdits } from './useStoryboardEdits';
import { ConflictDialog } from './ConflictDialog';

// Editors are only loaded when someone edits; the illustration editor (Excalidraw) lazily inside them.
const StepEditor = lazy(() => import('./StepEditor').then((m) => ({ default: m.StepEditor })));
const StoryEditor = lazy(() => import('./StoryEditor').then((m) => ({ default: m.StoryEditor })));

const MODES: { id: OverviewMode; label: string }[] = [
  { id: 'strip', label: 'Strip' },
  { id: 'lanes', label: 'Lanes' },
  { id: 'sequence', label: 'Sequence' },
];

async function exportDocument(d: StoryboardDetail, kind: 'html' | 'pdf'): Promise<string | null> {
  let svg: string | undefined;
  try {
    svg = await renderMermaidSvg(toMermaid(d, { extensions: true }));
  } catch {
    svg = undefined; // the export falls back to the Mermaid source
  }
  const r = kind === 'html' ? await window.cockpit.storyboards.exportHtml(d.id, svg, true) : await window.cockpit.storyboards.exportPdf(d.id, svg);
  return r.ok ? null : r.message;
}

/** The selected journey: header, checks, provenance, the pinned overview and the step below it. */
export function JourneyPane() {
  const d = useStoryboardsStore((s) => s.detail)!;
  const mode = useStoryboardsStore((s) => s.mode);
  const layers = useStoryboardsStore((s) => s.layers);
  const selectedStepId = useStoryboardsStore((s) => s.selectedStepId);
  const editing = useStoryboardsStore((s) => s.editing);
  const writable = useStoryboardsStore((s) => !!s.scan?.writable);
  const { setMode, toggleLayer, setPresenting, setEditing } = useStoryboardsStore.getState();
  const fixFor = useQuickFixes(d);
  const { reorder, insertAfter, message } = useStructureEdits(d);
  const [exportError, setExportError] = useState<string | null>(null);

  const step = d.steps.find((s) => s.id === selectedStepId) ?? null;
  const hasData = d.steps.some((s) => s.in.length || s.out.length || s.extensions.some((e) => e.in.length || e.out.length));
  const hasExtensions = d.steps.some((s) => s.extensions.length > 0);

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <div className="mr-auto min-w-0">
          <h1 className="truncate text-lg font-semibold">{d.title}</h1>
          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <span>{d.domain}</span> · <StatusBadge status={d.status} /> <TrustBadge trust={d.trust} /> {d.drift !== 'none' && <DriftBadge drift={d.drift} />}
            {d.owner && <span>· {d.owner}</span>}
          </div>
        </div>
        <div className="flex rounded-md border border-border p-0.5" role="tablist" aria-label="Overview mode">
          {MODES.map((m) => (
            <button key={m.id} role="tab" aria-selected={mode === m.id} onClick={() => setMode(m.id)} className={cn('rounded px-2 py-0.5 text-xs', mode === m.id && 'bg-accent font-medium')}>
              {m.label}
            </button>
          ))}
        </div>
        {hasData && (
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={layers.data} onChange={() => toggleLayer('data')} /> Data</label>
        )}
        {hasExtensions && (
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={layers.extensions} onChange={() => toggleLayer('extensions')} /> Alternate paths</label>
        )}
        <Button variant="outline" size="sm" onClick={() => setPresenting(true)} aria-label="Present"><Play className="mr-1 h-3.5 w-3.5" /> Present</Button>
        <Button variant="ghost" size="sm" onClick={async () => setExportError(await exportDocument(d, 'html'))}><FileDown className="mr-1 h-3.5 w-3.5" /> HTML</Button>
        <Button variant="ghost" size="sm" onClick={async () => setExportError(await exportDocument(d, 'pdf'))}><FileDown className="mr-1 h-3.5 w-3.5" /> PDF</Button>
        {writable && <Button variant="ghost" size="sm" onClick={() => setEditing({ kind: 'story' })} aria-label="Edit story"><Pencil className="h-3.5 w-3.5" /></Button>}
      </header>
      {(exportError || message) && <p className="border-b border-border px-4 py-1 text-xs text-destructive" role="alert">{exportError ?? message}</p>}

      <ChecksPanel d={d} fixFor={writable ? fixFor : undefined} />
      <ProvenancePanel d={d} />

      <div className="shrink-0 border-b border-border" data-testid="overview">
        {mode === 'strip' && <StripOverview d={d} onReorder={writable ? reorder : undefined} onInsert={writable ? insertAfter : undefined} />}
        {mode === 'lanes' && <LanesOverview d={d} />}
        {mode === 'sequence' && <SequenceOverview d={d} />}
      </div>

      <Suspense fallback={<p className="p-4 text-xs text-muted-foreground">Loading editor…</p>}>
        {editing?.kind === 'step' && d.steps.some((s) => s.id === editing.stepId) ? (
          <StepEditor key={editing.stepId} d={d} stepId={editing.stepId} />
        ) : editing?.kind === 'story' ? (
          <StoryEditor d={d} />
        ) : step ? (
          <StepDetail d={d} step={step} />
        ) : (
          <div className="flex-1 overflow-auto p-4 text-sm text-muted-foreground">
            <p>Select a step above, or use ← → to walk through the journey. Press P to present.</p>
          </div>
        )}
      </Suspense>
      <ConflictDialog />
    </div>
  );
}
