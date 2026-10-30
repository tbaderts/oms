import React, { useMemo } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { STORY_STATUSES, type StoryboardSummary } from '@shared/types/storyboards';
import { filterCatalogue, useStoryboardsStore } from '@/stores/storyboards';
import { DriftBadge, StatusBadge, TrustBadge } from './badges';

/** The catalogue: grouped by domain, filterable, with scan diagnostics that never hide valid entries. */
export function StoryboardBrowser() {
  const scan = useStoryboardsStore((s) => s.scan);
  const loading = useStoryboardsStore((s) => s.loading);
  const error = useStoryboardsStore((s) => s.error);
  const filter = useStoryboardsStore((s) => s.filter);
  const selectedId = useStoryboardsStore((s) => s.selectedId);
  const { setFilter, refresh, open, setEditing } = useStoryboardsStore.getState();

  const catalogue = scan?.catalogue ?? [];
  const shown = useMemo(() => filterCatalogue(catalogue, filter), [catalogue, filter]);
  const groups = useMemo(() => {
    const map = new Map<string, StoryboardSummary[]>();
    for (const s of shown) map.set(s.domain, [...(map.get(s.domain) ?? []), s]);
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [shown]);
  const domains = useMemo(() => [...new Set(catalogue.map((s) => s.domain))].sort(), [catalogue]);
  const tags = useMemo(() => [...new Set(catalogue.flatMap((s) => s.tags))].sort(), [catalogue]);
  const canCreate = !!scan?.writable && (scan?.roots.length ?? 0) > 0;

  return (
    <aside className="flex w-80 shrink-0 flex-col border-r border-border">
      <div className="space-y-2 border-b border-border p-3">
        <div className="flex items-center gap-2">
          <h2 className="mr-auto text-sm font-semibold">Storyboards</h2>
          <Button variant="ghost" size="icon" aria-label="Rescan" title="Rescan" onClick={() => refresh()} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
          {canCreate && (
            <Button size="sm" aria-label="New storyboard" onClick={() => setEditing({ kind: 'new' })}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New
            </Button>
          )}
        </div>
        <input
          type="search"
          aria-label="Filter storyboards"
          placeholder="Filter by title, summary or step…"
          className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
          value={filter.text}
          onChange={(e) => setFilter({ text: e.target.value })}
        />
        <div className="flex gap-1 text-xs">
          <FilterSelect label="Domain" value={filter.domain} options={domains} onChange={(domain) => setFilter({ domain })} />
          <FilterSelect label="Status" value={filter.status} options={[...STORY_STATUSES]} onChange={(status) => setFilter({ status: status as typeof filter.status })} />
          <FilterSelect label="Tag" value={filter.tag} options={tags} onChange={(tag) => setFilter({ tag })} />
        </div>
      </div>

      {(error || (scan?.errors.length ?? 0) > 0) && (
        <div className="max-h-40 overflow-auto border-b border-border bg-amber-500/10 p-2 text-xs" role="status" aria-label="Scan diagnostics">
          {error && <p className="text-destructive">{error}</p>}
          {scan?.errors.map((e) => (
            <p key={`${e.code}:${e.path}`} title={e.path}>
              <span className="font-mono">{e.code}</span> {e.message}
            </p>
          ))}
        </div>
      )}

      <nav className="flex-1 overflow-auto p-2" aria-label="Storyboard catalogue">
        {scan && !scan.enabled && <p className="p-2 text-xs text-muted-foreground">Storyboards are disabled in Settings.</p>}
        {scan?.enabled && !catalogue.length && <p className="p-2 text-xs text-muted-foreground">No storyboards found in {scan.roots.map((r) => r.label).join(', ') || 'the configured roots'}.</p>}
        {groups.map(([domain, items]) => (
          <section key={domain} className="mb-3">
            <h3 className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{domain}</h3>
            {items.map((s) => (
              <button
                key={s.id}
                type="button"
                data-id={s.id}
                aria-current={s.id === selectedId ? 'true' : undefined}
                onClick={() => open(s.id)}
                className={cn('mb-1 w-full rounded-md border border-transparent p-2 text-left hover:bg-accent', s.id === selectedId && 'border-border bg-accent')}
              >
                <div className="text-sm font-medium">{s.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                  <span>{s.stepCount} {s.stepCount === 1 ? 'step' : 'steps'}</span>
                  <StatusBadge status={s.status} />
                  <TrustBadge trust={s.trust} />
                  {s.drift !== 'none' && <DriftBadge drift={s.drift} />}
                </div>
                <div className="mt-2 flex gap-1 overflow-hidden" aria-hidden="true">
                  {s.thumbnails.map((url, i) => (
                    <span key={i} data-testid="thumb" className="h-8 w-11 shrink-0 overflow-hidden rounded-sm border border-border bg-muted">
                      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </section>
        ))}
      </nav>
    </aside>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="min-w-0 flex-1 rounded-md border border-input bg-background px-1 py-0.5">
      <option value="">All {label.toLowerCase()}s</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
