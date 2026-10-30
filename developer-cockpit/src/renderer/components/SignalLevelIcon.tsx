import React from 'react';
import { CheckCircle2, Hourglass, Info, XCircle, type LucideIcon } from 'lucide-react';
import type { SignalLevel } from '@/lib/signals';
import { cn } from '@/lib/utils';

/** Status colours (reserved; never the --stage-* palette), always shown with an icon and a label. */
const LEVEL_STYLE: Record<SignalLevel, { icon: LucideIcon; className: string }> = {
  critical: { icon: XCircle, className: 'text-destructive' },
  attention: { icon: Hourglass, className: 'text-warning' },
  good: { icon: CheckCircle2, className: 'text-success' },
  info: { icon: Info, className: 'text-muted-foreground' },
};

export function SignalLevelIcon({ level, className }: { level: SignalLevel; className?: string }) {
  const { icon: Icon, className: tint } = LEVEL_STYLE[level];
  return <Icon aria-hidden data-icon={level} className={cn('h-4 w-4 shrink-0', tint, className)} />;
}
