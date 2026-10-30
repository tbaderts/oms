import React, { useMemo, useState } from 'react';
import { Download, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MermaidDiagram } from '@/components/MermaidDiagram';
import { cn } from '@/lib/utils';
import { toMermaid } from '@shared/storyboards/mermaid';
import type { Step, StoryboardDetail } from '@shared/types/storyboards';
import { useStoryboardsStore } from '@/stores/storyboards';
import { PlaceholderPanel, RoughArrow, SketchFrame } from './Sketch';

const laneLabel = (d: StoryboardDetail, id?: string) => (id ? d.lanes.find((l) => l.id === id)?.label ?? id : undefined);

/** Selection and hover are shared by Strip and Lanes through the store. */
function useStepState() {
  const selected = useStoryboardsStore((s) => s.selectedStepId);
  const hovered = useStoryboardsStore((s) => s.hoveredStepId);
  const { selectStep, hoverStep } = useStoryboardsStore.getState();
  return { selected, hovered, selectStep, hoverStep };
}

function StepThumb({ d, step }: { d: StoryboardDetail; step: Step }) {
  const ill = step.illustrations[0];
  const [broken, setBroken] = useState(false);
  if (ill && ill.url && !ill.missing && !broken) {
    return <img src={ill.url} alt={ill.caption ?? step.title} className="h-full w-full object-contain p-1" onError={() => setBroken(true)} />;
  }
  return <PlaceholderPanel from={laneLabel(d, step.from)} to={laneLabel(d, step.to)} title={step.title} />;
}

/** The optional data and alternate-path layers of one step (Strip and Lanes show the same badges). */
function LayerBadges({ step }: { step: Step }) {
  const layers = useStoryboardsStore((s) => s.layers);
  const wrap = 'mt-1 flex flex-wrap gap-0.5 text-[10px]';
  return (
    <>
      {layers.data && (step.in.length > 0 || step.out.length > 0) && (
        <div className={wrap} data-testid="data-layer">
          {step.in.map((i) => <span key={`in-${i.name}`} className="whitespace-nowrap rounded bg-sky-500/15 px-1">⇢ {i.name}</span>)}
          {step.out.map((o) => <span key={`out-${o.name}`} className="whitespace-nowrap rounded bg-emerald-500/15 px-1">{o.name} ⇢</span>)}
        </div>
      )}
      {layers.extensions && step.extensions.length > 0 && (
        <div className={wrap} data-testid="extension-layer">
          {step.extensions.map((e) => <span key={e.id} className="whitespace-nowrap rounded bg-amber-500/20 px-1" title={`When ${e.when}`}>{e.label}</span>)}
        </div>
      )}
    </>
  );
}

/** Filmstrip: one sketch panel per step, with optional data and alternate-path layers. */
export function StripOverview({ d, onReorder, onInsert }: { d: StoryboardDetail; onReorder?: (stepIds: string[]) => void; onInsert?: (afterStepId: string | null) => void }) {
  const { selected, hovered, selectStep, hoverStep } = useStepState();
  const [dragging, setDragging] = useState<string | null>(null);

  const drop = (targetId: string) => {
    if (!dragging || dragging === targetId || !onReorder) return;
    const ids = d.steps.map((s) => s.id).filter((id) => id !== dragging);
    ids.splice(ids.indexOf(targetId) + (d.steps.findIndex((s) => s.id === dragging) < d.steps.findIndex((s) => s.id === targetId) ? 1 : 0), 0, dragging);
    setDragging(null);
    onReorder(ids);
  };

  return (
    <ol className="flex items-stretch gap-1 overflow-x-auto p-3" aria-label="Journey strip">
      {d.steps.map((step) => {
        const isSelected = step.id === selected;
        return (
          <li key={step.id} className="flex items-stretch">
            <button
              type="button"
              aria-label={`Step ${step.index + 1}: ${step.title}`}
              aria-pressed={isSelected}
              data-hovered={step.id === hovered ? 'true' : undefined}
              draggable={!!onReorder}
              onDragStart={() => setDragging(step.id)}
              onDragOver={(e) => onReorder && e.preventDefault()}
              onDrop={() => drop(step.id)}
              onClick={() => selectStep(step.id)}
              onMouseEnter={() => hoverStep(step.id)}
              onMouseLeave={() => hoverStep(null)}
              className={cn('w-36 shrink-0 rounded-md p-1 text-left', step.id === hovered && 'bg-accent/60', isSelected && 'bg-accent', !step.readable && 'opacity-60')}
            >
              <SketchFrame seedKey={step.id} emphasis={isSelected} className="h-24">
                <StepThumb d={d} step={step} />
              </SketchFrame>
              <div className="mt-1 flex items-baseline gap-1 text-xs">
                <span className="font-semibold">{step.index + 1}</span>
                <span className="line-clamp-2">{step.title}</span>
              </div>
              <LayerBadges step={step} />
            </button>
            {onInsert && (
              <button type="button" aria-label={`Insert a step after step ${step.index + 1}`} onClick={() => onInsert(step.id)} className="mx-0.5 self-center rounded-full p-0.5 text-muted-foreground opacity-40 hover:bg-accent hover:opacity-100">
                <Plus className="h-3 w-3" />
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}

const CELL_W = 150;
const CARD_H = 44;
const LABEL_W = 120;

/** Swimlanes: each step sits in the lane that is responsible for it, with arrows between consecutive steps. */
export function LanesOverview({ d }: { d: StoryboardDetail }) {
  const { selected, hovered, selectStep, hoverStep } = useStepState();
  const layers = useStoryboardsStore((s) => s.layers);
  const hasData = layers.data && d.steps.some((s) => s.in.length || s.out.length);
  const hasExtensions = layers.extensions && d.steps.some((s) => s.extensions.length);
  const CELL_H = 64 + (hasData ? 44 : 0) + (hasExtensions ? 20 : 0);
  const rows = useMemo(() => {
    const ids = d.lanes.map((l) => l.id);
    for (const s of d.steps) for (const lane of [s.from, s.to]) if (lane && !ids.includes(lane)) ids.push(lane);
    return [...ids, ''];
  }, [d]);
  const rowOf = (s: Step) => {
    const lane = s.from ?? s.to;
    return lane ? rows.indexOf(lane) : rows.length - 1;
  };
  const usedRows = rows.filter((r, i) => r !== '' || d.steps.some((s) => rowOf(s) === i));
  const width = LABEL_W + d.steps.length * CELL_W;
  const height = usedRows.length * CELL_H;
  const centre = (s: Step) => ({ x: LABEL_W + s.index * CELL_W + CELL_W / 2, y: usedRows.indexOf(rows[rowOf(s)]) * CELL_H + 10 + CARD_H / 2 });

  return (
    <div className="overflow-auto p-3" aria-label="Journey lanes" role="group">
      <div className="relative" style={{ width, height }}>
        {usedRows.map((laneId, r) => (
          <div key={laneId || 'unassigned'} className="absolute left-0 flex items-center border-b border-dashed border-border text-xs text-muted-foreground" style={{ top: r * CELL_H, height: CELL_H, width }}>
            <span className="w-[120px] truncate pr-2 font-medium" data-testid="lane-label">{laneId ? laneLabel(d, laneId) : 'unassigned'}</span>
          </div>
        ))}
        <svg className="pointer-events-none absolute inset-0 text-muted-foreground" width={width} height={height} aria-hidden="true">
          {d.steps.slice(1).map((s, i) => {
            const a = centre(d.steps[i]);
            const b = centre(s);
            return <RoughArrow key={s.id} seedKey={`${d.steps[i].id}->${s.id}`} x1={a.x + 60} y1={a.y} x2={b.x - 60} y2={b.y} />;
          })}
        </svg>
        {d.steps.map((s) => {
          const c = centre(s);
          const isSelected = s.id === selected;
          return (
            <button
              key={s.id}
              type="button"
              aria-label={`Step ${s.index + 1}: ${s.title}`}
              aria-pressed={isSelected}
              data-hovered={s.id === hovered ? 'true' : undefined}
              onClick={() => selectStep(s.id)}
              onMouseEnter={() => hoverStep(s.id)}
              onMouseLeave={() => hoverStep(null)}
              className={cn('absolute rounded-md text-left text-[11px]', s.id === hovered && 'bg-accent/60', isSelected && 'bg-accent')}
              style={{ left: c.x - 60, top: c.y - CARD_H / 2, width: 120 }}
            >
              <SketchFrame seedKey={s.id} emphasis={isSelected} className="h-11">
                <span className="line-clamp-2 px-2 py-1"><strong>{s.index + 1}</strong> {s.title}</span>
              </SketchFrame>
              <LayerBadges step={s} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The generated sequence diagram: read-only, with copy (in the diagram) and download of its source. */
export function SequenceOverview({ d }: { d: StoryboardDetail }) {
  const withExtensions = useStoryboardsStore((s) => s.layers.extensions);
  const withData = useStoryboardsStore((s) => s.layers.data);
  const source = useMemo(() => toMermaid(d, { extensions: withExtensions, data: withData }), [d, withExtensions, withData]);
  return (
    <div className="space-y-2 overflow-auto p-3" aria-label="Sequence diagram" role="group">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => window.cockpit.storyboards.exportMermaid(d.id, withExtensions, true)}>
          <Download className="mr-1 h-3.5 w-3.5" /> Download .mmd
        </Button>
      </div>
      <MermaidDiagram source={source} />
    </div>
  );
}
