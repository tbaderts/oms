import React, { useEffect, useRef } from 'react';
import rough from 'roughjs';
import { fnv1a } from '@shared/storyboards/ids';
import { cn } from '@/lib/utils';

/** Rough.js needs a 31-bit seed; the same key always draws the same strokes. */
export function seedOf(key: string): number {
  return (fnv1a(key) % 2_147_483_646) + 1;
}

/**
 * A hand-drawn frame behind its children. The seed comes from the step id, so the sketch looks the
 * same on every render instead of wiggling.
 */
export function SketchFrame({ seedKey, emphasis, className, children }: { seedKey: string; emphasis?: boolean; className?: string; children?: React.ReactNode }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const rc = rough.svg(svg);
    svg.appendChild(rc.rectangle(2, 2, 96, 66, { seed: seedOf(seedKey), roughness: 1.4, bowing: 1.2, strokeWidth: emphasis ? 2.4 : 1.2, stroke: 'currentColor' }));
  }, [seedKey, emphasis]);
  return (
    <div className={cn('relative', className)}>
      <svg ref={ref} viewBox="0 0 100 70" preserveAspectRatio="none" aria-hidden="true" className={cn('pointer-events-none absolute inset-0 h-full w-full', emphasis ? 'text-primary' : 'text-muted-foreground/70')} />
      <div className="relative h-full w-full">{children}</div>
    </div>
  );
}

/** Generated stand-in when a step has no (readable) illustration: lane → lane and the title. */
export function PlaceholderPanel({ from, to, title }: { from?: string; to?: string; title: string }) {
  return (
    <div data-testid="placeholder-panel" className="flex h-full flex-col items-center justify-center gap-1 p-2 text-center font-[cursive] text-xs text-muted-foreground">
      <span>
        {from ?? '·'} → {to ?? '·'}
      </span>
      <span className="line-clamp-2 text-[11px]">{title}</span>
    </div>
  );
}

/** Draws a rough arrow from (x1,y1) to (x2,y2) into a parent SVG element. */
export function RoughArrow({ x1, y1, x2, y2, seedKey }: { x1: number; y1: number; x2: number; y2: number; seedKey: string }) {
  const ref = useRef<SVGGElement>(null);
  useEffect(() => {
    const g = ref.current;
    const svg = g?.ownerSVGElement;
    if (!g || !svg) return;
    while (g.firstChild) g.removeChild(g.firstChild);
    const rc = rough.svg(svg);
    const seed = seedOf(seedKey);
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const head = (a: number) => [x2 - 8 * Math.cos(angle - a), y2 - 8 * Math.sin(angle - a)] as const;
    const [hx1, hy1] = head(0.45);
    const [hx2, hy2] = head(-0.45);
    for (const node of [
      rc.line(x1, y1, x2, y2, { seed, roughness: 1, stroke: 'currentColor' }),
      rc.line(x2, y2, hx1, hy1, { seed: seed + 1, roughness: 0.6, stroke: 'currentColor' }),
      rc.line(x2, y2, hx2, hy2, { seed: seed + 2, roughness: 0.6, stroke: 'currentColor' }),
    ]) g.appendChild(node);
  }, [x1, y1, x2, y2, seedKey]);
  return <g ref={ref} data-testid="lane-arrow" />;
}
