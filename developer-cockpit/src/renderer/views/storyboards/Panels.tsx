import React, { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, ShieldCheck, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Problem, StoryboardDetail } from '@shared/types/storyboards';
import { useStoryboardsStore } from '@/stores/storyboards';
import { DriftBadge, TrustBadge } from './badges';

export interface QuickFix {
  label: string;
  apply: () => void;
}

/**
 * Validation findings above the journey, grouped by severity. They never replace the journey;
 * clicking one selects its step. `fixFor` offers safe quick fixes for some findings.
 */
export function ChecksPanel({ d, fixFor }: { d: StoryboardDetail; fixFor?: (p: Problem) => QuickFix | null }) {
  const [open, setOpen] = useState(true);
  const { selectStep } = useStoryboardsStore.getState();
  if (!d.problems.length) return null;
  const errors = d.problems.filter((p) => p.severity === 'error');
  const warnings = d.problems.filter((p) => p.severity === 'warning');
  const stepIds = new Set(d.steps.map((s) => s.id));
  const group = (title: string, items: Problem[], tone: string) =>
    items.length > 0 && (
      <div>
        <h3 className={cn('text-xs font-semibold', tone)}>{title}</h3>
        <ul className="space-y-0.5">
          {items.map((p, i) => {
            const fix = fixFor?.(p);
            return (
              <li key={`${p.code}-${p.stepId}-${p.extensionId}-${i}`} className="flex items-start gap-2 text-xs">
                <button type="button" className="text-left hover:underline disabled:no-underline" disabled={!p.stepId || !stepIds.has(p.stepId)} onClick={() => p.stepId && selectStep(p.stepId)}>
                  <span className="font-mono text-muted-foreground">{p.code}</span> {p.message}
                </button>
                {fix && (
                  <button type="button" onClick={fix.apply} className="ml-auto inline-flex shrink-0 items-center gap-1 rounded border border-border px-1.5 text-[11px] hover:bg-accent">
                    <Wrench className="h-3 w-3" /> {fix.label}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  return (
    <section aria-label="Checks" className="border-b border-border bg-amber-500/5 px-4 py-2">
      <button type="button" className="flex items-center gap-1 text-xs font-medium" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> {errors.length} error(s), {warnings.length} warning(s)
      </button>
      {open && <div className="mt-1 max-h-36 space-y-2 overflow-auto">{group('Errors', errors, 'text-destructive')}{group('Warnings', warnings, 'text-amber-600 dark:text-amber-400')}</div>}
    </section>
  );
}

/** Evidence and provenance from story.card.yaml: trust, drift, pinned modules, changed sources, KB links. */
export function ProvenancePanel({ d }: { d: StoryboardDetail }) {
  const [open, setOpen] = useState(false);
  const ev = d.evidence;
  return (
    <section aria-label="Provenance" className="border-b border-border px-4 py-1.5 text-xs">
      <button type="button" className="flex items-center gap-1.5" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <ShieldCheck className="h-3.5 w-3.5" /> Provenance <TrustBadge trust={d.trust} /> {d.drift !== 'none' && <DriftBadge drift={d.drift} />}
      </button>
      {open && (
        <div className="mt-1 space-y-1 pl-5">
          {!d.hasCard && <p className="text-muted-foreground">No evidence card (story.card.yaml): this storyboard is unevidenced.</p>}
          {ev && (
            <>
              {ev.repos.map((r) => <p key={r.module}>Pinned <code>{r.module}</code> at <code>{r.commit}</code> — <DriftBadge drift={r.drift} /></p>)}
              {ev.sources.filter((s) => s.drift !== 'current').map((s) => (
                <p key={`${s.module}/${s.path}:${s.line}`} className="text-amber-600 dark:text-amber-400">{s.drift}: <code>{s.module}/{s.path}{s.line ? `:${s.line}-${s.endLine}` : ''}</code> {s.label}</p>
              ))}
              {ev.kbLinks.map((l) => <p key={l.path} className={cn(!l.exists && 'text-destructive')}>KB <code>{l.path}</code>{l.exists ? '' : ' (missing)'}</p>)}
              {ev.verified.map((v) => <p key={`${v.by}${v.at}`}>Verified by {v.by} {v.at && `on ${v.at.slice(0, 10)}`}</p>)}
              {ev.issues.map((i) => <p key={i.message} className="text-destructive">{i.message}</p>)}
            </>
          )}
        </div>
      )}
    </section>
  );
}
