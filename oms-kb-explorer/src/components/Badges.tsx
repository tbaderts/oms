import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { statusBadge, trustBadge, type TrustBadge } from '../okf/status';

/** The tone tokens a badge can use: colour carries meaning, as in oms-ui (SPEC-0066). */
export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'violet' | 'accent';

const TONE: Record<Tone, string> = {
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
  info: 'bg-info-bg text-info',
  neutral: 'bg-neutral-bg text-neutral',
  violet: 'bg-violet-bg text-violet',
  accent: 'bg-accent-bg text-accent',
};

/** oms-ui's badge: a small tinted label, sentence case, no letter spacing. */
export function ToneBadge({ tone, title, className = '', children }: { tone: Tone; title?: string; className?: string; children: ReactNode }) {
  return (
    <span title={title} className={`inline-flex items-center gap-0.5 whitespace-nowrap rounded-sm px-1.5 py-px text-2xs font-medium ${TONE[tone]} ${className}`}>
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, Tone> = { stable: 'success', draft: 'warning', deprecated: 'neutral' };
const TRUST_TONE: Record<TrustBadge['tone'], Tone> = { good: 'success', neutral: 'info', warning: 'warning' };

export function StatusPill({ status }: { status?: string | null }) {
  const badge = statusBadge(status);
  if (badge === 'unknown') return null;
  return (
    <ToneBadge tone={STATUS_TONE[badge]} title={`Status: ${status}`} className={badge === 'deprecated' ? 'line-through' : ''}>
      {badge}
    </ToneBadge>
  );
}

export function TrustPill({ tier }: { tier?: string | null }) {
  return <TrustBadgePill badge={trustBadge(tier)} />;
}

export function TrustBadgePill({ badge }: { badge: TrustBadge | null }) {
  if (!badge) return null;
  return (
    <ToneBadge tone={TRUST_TONE[badge.tone]} title="Trust tier (OKF verified)">
      {badge.label}
    </ToneBadge>
  );
}

export function TypePill({ type }: { type?: string | null }) {
  if (!type) return null;
  return <ToneBadge tone="violet">{type}</ToneBadge>;
}

export function StalePill({ staleAfter }: { staleAfter?: string }) {
  return (
    <ToneBadge tone="danger" title={staleAfter ? `Stale since ${staleAfter}` : 'Stale'}>
      <AlertTriangle className="h-3 w-3" /> Stale
    </ToneBadge>
  );
}
