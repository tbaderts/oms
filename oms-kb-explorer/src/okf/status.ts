// Badges for OKF status and trust tier. Legacy bold-header statuses map onto the OKF lifecycle.

export type StatusBadge = 'stable' | 'draft' | 'deprecated' | 'unknown';

export function statusBadge(status?: string | null): StatusBadge {
  const s = (status ?? '').trim().toLowerCase();
  if (['stable', 'active', 'complete', 'implementation complete'].includes(s)) return 'stable';
  if (s.startsWith('draft')) return 'draft';
  if (s === 'deprecated') return 'deprecated';
  return 'unknown';
}

export interface TrustBadge {
  label: string;
  tone: 'good' | 'neutral' | 'warning';
}

const TRUST: Record<string, TrustBadge> = {
  'human-reviewed': { label: 'Human-reviewed', tone: 'good' },
  'machine-confirmed': { label: 'Machine-confirmed', tone: 'neutral' },
  unverified: { label: 'Unverified', tone: 'warning' },
};

export function trustBadge(tier?: string | null): TrustBadge | null {
  return tier ? (TRUST[tier] ?? null) : null;
}
