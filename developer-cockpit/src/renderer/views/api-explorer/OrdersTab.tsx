import React from 'react';
import { ChevronLeft, ChevronRight, Loader2, Plus, Search, X } from 'lucide-react';
import { FILTER_FIELDS, type FilterOp, type QueryParam } from '@shared/apiExplorer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApiExplorerStore } from '@/stores/apiExplorer';
import { OrderFollowUp } from './OrderFollowUp';

const COLUMNS = ['orderId', 'clOrdId', 'symbol', 'side', 'orderQty', 'cumQty', 'state', 'transactTime'] as const;
const selectClass = 'h-8 rounded-md border bg-background px-2 text-xs';

interface PagedOrders {
  content?: Record<string, unknown>[];
  page?: { number?: number; size?: number; totalElements?: number; totalPages?: number };
}

/** Order search over the query API with only the fields and operators it supports (SPEC-0007 AC-6). */
export function OrdersTab() {
  const { filters, size, sort, searching, searchResult, addFilter, removeFilter, setPaging, searchUrl, search, openFollowUp } =
    useApiExplorerStore();
  const result = searchResult?.ok ? (searchResult.body as PagedOrders) : null;
  const page = result?.page;
  const pageNumber = page?.number ?? 0;
  const totalPages = page?.totalPages ?? 0;

  return (
    <div className="space-y-4 p-4">
      <section aria-label="Order search" className="space-y-3 rounded-md border p-3">
        {filters.map((f, i) => (
          <FilterRow key={i} index={i} filter={f} onRemove={() => removeFilter(i)} />
        ))}
        <div className="flex flex-wrap items-end gap-3">
          <Button size="sm" variant="outline" onClick={addFilter}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add filter
          </Button>
          <label className="text-xs">
            <span className="block pb-1 text-muted-foreground">Size</span>
            <Input
              aria-label="Size"
              type="number"
              min={1}
              max={500}
              value={size}
              onChange={(e) => setPaging({ size: Math.min(500, Math.max(1, Number(e.target.value) || 1)) })}
              className="h-8 w-20 text-xs"
            />
          </label>
          <label className="text-xs">
            <span className="block pb-1 text-muted-foreground">Sort</span>
            <Input
              aria-label="Sort"
              placeholder="transactTime,DESC"
              value={sort}
              onChange={(e) => setPaging({ sort: e.target.value })}
              className="h-8 w-56 font-mono text-xs"
            />
          </label>
          <div className="flex-1" />
          <Button size="sm" onClick={() => void search(0)} disabled={searching}>
            {searching ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Search className="mr-1 h-3.5 w-3.5" />}
            Search
          </Button>
        </div>
        <p className="break-all rounded bg-muted/40 px-2 py-1 font-mono text-xs">
          <span className="text-muted-foreground">GET </span>
          <span aria-label="Request URL">{searchUrl()}</span>
        </p>
      </section>

      {searchResult && !searchResult.ok && (
        <p role="alert" className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-destructive">
          {searchResult.error ?? `HTTP ${searchResult.status}: ${typeof searchResult.body === 'string' ? searchResult.body : JSON.stringify(searchResult.body)}`}
        </p>
      )}

      {result && (
        <section aria-label="Results" className="rounded-md border">
          <div className="flex items-center gap-2 border-b px-3 py-2 text-xs">
            <span>
              Page {totalPages === 0 ? 0 : pageNumber + 1} of {totalPages} · {page?.totalElements ?? 0} orders
            </span>
            <span className="text-muted-foreground">{searchResult!.durationMs} ms</span>
            <div className="flex-1" />
            <Button size="sm" variant="ghost" aria-label="Previous page" disabled={searching || pageNumber <= 0} onClick={() => void search(pageNumber - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Next page"
              disabled={searching || pageNumber + 1 >= totalPages}
              onClick={() => void search(pageNumber + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table aria-label="Orders" className="w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  {COLUMNS.map((c) => (
                    <th key={c} className="px-3 py-1 font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(result.content ?? []).map((o, i) => (
                  <tr
                    key={String(o.orderId ?? i)}
                    className="cursor-pointer border-t hover:bg-accent"
                    onClick={() => typeof o.orderId === 'string' && void openFollowUp(o.orderId)}
                  >
                    {COLUMNS.map((c) => (
                      <td key={c} className="whitespace-nowrap px-3 py-1 font-mono">
                        {o[c] === null || o[c] === undefined ? '' : String(o[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <OrderFollowUp />
    </div>
  );
}

function FilterRow({ index, filter, onRemove }: { index: number; filter: QueryParam; onRemove: () => void }) {
  const { catalog, updateFilter } = useApiExplorerStore();
  const n = index + 1;
  const field = FILTER_FIELDS.find((f) => f.field === filter.field) ?? FILTER_FIELDS[0];
  const enumValues = field.enumName ? ((catalog?.schemas[`enum:${field.enumName}`]?.enum ?? []) as string[]) : null;
  const update = (patch: Partial<QueryParam>) => updateFilter(index, patch);
  const [from = '', to = ''] = filter.op === 'between' ? filter.value.split(',') : [];
  const placeholder = field.kind === 'datetime' ? '2025-08-29T12:34:56Z' : '';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label={`Field ${n}`} value={filter.field} onChange={(e) => update({ field: e.target.value })} className={selectClass}>
        {FILTER_FIELDS.map((f) => (
          <option key={f.field} value={f.field}>
            {f.field}
          </option>
        ))}
      </select>
      <select aria-label={`Operator ${n}`} value={filter.op} onChange={(e) => update({ op: e.target.value as FilterOp })} className={selectClass}>
        {field.ops.map((op) => (
          <option key={op} value={op}>
            {op}
          </option>
        ))}
      </select>
      {enumValues ? (
        <select aria-label={`Value ${n}`} value={filter.value} onChange={(e) => update({ value: e.target.value })} className={selectClass}>
          <option value="" />
          {enumValues.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      ) : filter.op === 'between' ? (
        <>
          <Input aria-label={`From ${n}`} placeholder={placeholder} value={from} onChange={(e) => update({ value: `${e.target.value},${to}` })} className="h-8 w-44 font-mono text-xs" />
          <Input aria-label={`To ${n}`} placeholder={placeholder} value={to} onChange={(e) => update({ value: `${from},${e.target.value}` })} className="h-8 w-44 font-mono text-xs" />
        </>
      ) : (
        <Input aria-label={`Value ${n}`} placeholder={placeholder} value={filter.value} onChange={(e) => update({ value: e.target.value })} className="h-8 w-56 font-mono text-xs" />
      )}
      <Button size="sm" variant="ghost" aria-label={`Remove filter ${n}`} onClick={onRemove}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
