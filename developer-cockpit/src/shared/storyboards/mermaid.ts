// Generated Mermaid sequenceDiagram for a storyboard (source-spec §9.1). Derived, never edited.
import type { ContinueAt, StoryboardDetail } from '../types/storyboards';
import { extensionLabel, stepLabel } from './labels';

type Input = Pick<StoryboardDetail, 'lanes' | 'steps'>;

/** Collapses whitespace and removes characters that can end or reinterpret a Mermaid message. */
export function sanitizeMermaid(text: string): string {
  return text.replace(/[;#<>{}:]/g, '').replace(/\s+/g, ' ').trim();
}

/** Lane ids go into participant positions; keep only id-safe characters. */
function participantId(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, '_') || '_';
}

function continuation(c: ContinueAt, steps: Input['steps'], ownIndex: number): string {
  if (c.kind === 'stay') return `retry step ${stepLabel(ownIndex)}`;
  if (c.kind === 'end') return 'end of journey';
  const target = steps.find((s) => s.id === c.step);
  return target ? `continue at step ${stepLabel(target.index)}` : `continue at ${sanitizeMermaid(c.step)}`;
}

/** `extensions` adds an opt block per alternate path; `data` adds a note with each step's inputs and outputs. */
export function toMermaid(story: Input, opts: { extensions?: boolean; data?: boolean } = {}): string {
  const lines = ['sequenceDiagram'];
  const declared = new Set<string>();
  for (const lane of story.lanes) {
    const id = participantId(lane.id);
    lines.push(`  ${lane.kind === 'actor' ? 'actor' : 'participant'} ${id} as ${sanitizeMermaid(lane.label) || id}`);
    declared.add(lane.id);
  }
  // Steps may name lanes that were never declared; validation reports that, the export stays complete.
  const ensure = (laneId: string) => {
    if (!declared.has(laneId)) {
      lines.push(`  participant ${participantId(laneId)}`);
      declared.add(laneId);
    }
    return participantId(laneId);
  };
  const fallbackLane = story.lanes[0]?.id;

  for (const step of story.steps) {
    const text = `${stepLabel(step.index)}. ${sanitizeMermaid(step.title)}`;
    let over: string;
    if (step.from && step.to) {
      const from = ensure(step.from);
      const to = ensure(step.to);
      lines.push(`  ${from}${step.kind === 'external' ? '-->>' : '->>'}${to}: ${text}`);
      over = from === to ? from : `${from},${to}`;
    } else {
      const lane = step.from ?? step.to ?? fallbackLane;
      over = lane ? ensure(lane) : ensure('journey');
      lines.push(`  Note over ${over}: ${text}`);
    }

    if (opts.data && (step.in.length || step.out.length)) {
      const target = step.to ? ensure(step.to) : over.split(',').pop()!;
      const parts = [
        step.in.length ? `in ${step.in.map((i) => sanitizeMermaid(i.name)).join(', ')}` : '',
        step.out.length ? `out ${step.out.map((o) => sanitizeMermaid(o.name)).join(', ')}` : '',
      ].filter(Boolean);
      lines.push(`  Note right of ${target}: ${parts.join(' · ')}`);
    }

    if (!opts.extensions) continue;
    step.extensions.forEach((ext, i) => {
      lines.push(`  opt ${extensionLabel(step.index, i)} ${sanitizeMermaid(ext.when)}`);
      lines.push(`    Note over ${over}: Then ${sanitizeMermaid(ext.then)} → ${continuation(ext.continueAt, story.steps, step.index)}`);
      lines.push('  end');
    });
  }
  return lines.join('\n');
}
