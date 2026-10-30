import { AlertTriangle } from 'lucide-react';
import { statusBadge, trustBadge, type TrustBadge } from '../okf/status';

const PILL = 'inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap';

const STATUS_COLORS: Record<string, string> = {
  stable: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  draft: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  deprecated: 'bg-gray-200 text-gray-700 line-through dark:bg-gray-700 dark:text-gray-300',
};

const TRUST_COLORS: Record<string, string> = {
  good: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  neutral: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
  warning: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
};

export function StatusPill({ status }: { status?: string | null }) {
  const badge = statusBadge(status);
  if (badge === 'unknown') return null;
  return <span className={`${PILL} ${STATUS_COLORS[badge]}`} title={`Status: ${status}`}>{badge}</span>;
}

export function TrustPill({ tier }: { tier?: string | null }) {
  return <TrustBadgePill badge={trustBadge(tier)} />;
}

export function TrustBadgePill({ badge }: { badge: TrustBadge | null }) {
  if (!badge) return null;
  return <span className={`${PILL} ${TRUST_COLORS[badge.tone]}`} title="Trust tier (OKF verified)">{badge.label}</span>;
}

export function TypePill({ type }: { type?: string | null }) {
  if (!type) return null;
  return <span className={`${PILL} bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200`}>{type}</span>;
}

export function StalePill({ staleAfter }: { staleAfter?: string }) {
  return (
    <span className={`${PILL} bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200`} title={staleAfter ? `Stale since ${staleAfter}` : 'Stale'}>
      <AlertTriangle className="w-3 h-3 mr-0.5" /> Stale
    </span>
  );
}
