import React from 'react';
import { cn } from '@/lib/utils';
import type { DriftStatus, StoryStatus, TrustTier } from '@shared/types/storyboards';

const pill = 'inline-flex items-center rounded-full border px-1.5 py-px text-[10px] font-medium leading-4';

export function StatusBadge({ status }: { status: StoryStatus }) {
  const tone = status === 'stable' ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400' : status === 'deprecated' ? 'border-muted-foreground/40 line-through' : 'border-sky-500/40 text-sky-600 dark:text-sky-400';
  return <span className={cn(pill, tone)}>{status}</span>;
}

export function TrustBadge({ trust }: { trust: TrustTier }) {
  const tone = trust === 'human-verified' ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400' : trust === 'evidenced' ? 'border-sky-500/40 text-sky-600 dark:text-sky-400' : 'border-muted-foreground/40 text-muted-foreground';
  return <span className={cn(pill, tone)} title="Trust tier from the evidence card">{trust}</span>;
}

export function DriftBadge({ drift }: { drift: DriftStatus }) {
  const tone = drift === 'current' ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400' : 'border-amber-500/50 text-amber-600 dark:text-amber-400';
  return <span className={cn(pill, tone)} title="Implementation drift since the pinned commit">{drift}</span>;
}
