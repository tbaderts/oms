import React, { useState } from 'react';
import { Copy, Loader2, RefreshCw } from 'lucide-react';
import type { TimelineEvent } from '@shared/apiExplorer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { namesOrder } from '@/lib/api-schema';
import { useApiExplorerStore } from '@/stores/apiExplorer';

const ORDER_FIELDS = ['state', 'cancelState', 'side', 'symbol', 'orderQty', 'cumQty', 'leavesQty', 'price'] as const;

const json = (v: unknown) => JSON.stringify(v, null, 2);

/** The order a command touched: its current state (query API) and its event log (SPEC-0007 AC-5). */
export function OrderFollowUp() {
  const { followUpId, followUp, followUpLoading, catalog, refreshFollowUp, selectType, useOrderAsTemplate } = useApiExplorerStore();
  if (!followUpId) return null;
  const data = followUp?.orderId === followUpId ? followUp : null;
  const nextTypes = (catalog?.commandTypes ?? []).filter((t) => catalog?.schemas[t] && namesOrder(catalog.schemas[t]));

  return (
    <section aria-label="Order follow-up" className="rounded-md border">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <h3 className="font-mono text-sm font-medium">Order {followUpId}</h3>
        {followUpLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        <div className="flex-1" />
        <select
          aria-label="Next command"
          value=""
          onChange={(e) => e.target.value && selectType(e.target.value, { orderId: followUpId })}
          className="h-8 rounded-md border bg-background px-2 text-xs"
        >
          <option value="">Next command…</option>
          {nextTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {data?.order && (
          <Button size="sm" variant="outline" onClick={() => useOrderAsTemplate(data.order!)} title="A new order with this order's fields">
            <Copy className="mr-1 h-3.5 w-3.5" />
            Use as template
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => void refreshFollowUp()} disabled={followUpLoading}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {data?.error && (
        <p role="alert" className="border-b bg-red-500/10 px-3 py-2 text-xs text-destructive">
          {data.error}
        </p>
      )}

      {data && (
        <div className="space-y-3 p-3">
          {data.order ? (
            <dl className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-2 text-sm">
              {ORDER_FIELDS.filter((f) => data.order![f] !== undefined && data.order![f] !== null).map((f) => (
                <div key={f}>
                  <dt className="text-xs text-muted-foreground">{f}</dt>
                  <dd className="font-mono" data-field={f}>
                    {String(data.order![f])}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            !data.orderError && <p className="text-sm text-muted-foreground">Order {followUpId} not found</p>
          )}

          {data.order && data.events && <Timeline events={data.events} />}
          {data.events === null && data.rawEvents !== undefined && (
            <div>
              <p className="pb-1 text-xs text-muted-foreground">Event log in an unexpected shape, shown as returned:</p>
              <pre className="max-h-64 overflow-auto rounded bg-muted/40 p-2 font-mono text-xs">{json(data.rawEvents)}</pre>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Timeline({ events }: { events: TimelineEvent[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (events.length === 0) return <p className="text-xs text-muted-foreground">No events recorded.</p>;
  return (
    <table aria-label="Event timeline" className="w-full text-left text-xs">
      <thead className="text-muted-foreground">
        <tr>
          <th className="py-1 pr-3 font-medium">Version</th>
          <th className="py-1 pr-3 font-medium">Event</th>
          <th className="py-1 pr-3 font-medium">Resulting state</th>
          <th className="py-1 pr-3 font-medium">Time</th>
          <th className="py-1" />
        </tr>
      </thead>
      <tbody>
        {events.map((e) => (
          <React.Fragment key={e.version}>
            <tr className="border-t">
              <td className="py-1 pr-3 font-mono">{e.version}</td>
              <td className="py-1 pr-3 font-mono">{e.event}</td>
              <td className="py-1 pr-3">{e.resultingState && <Badge variant="outline">{e.resultingState}</Badge>}</td>
              <td className="py-1 pr-3 font-mono text-muted-foreground">{e.timeStamp ?? ''}</td>
              <td className="py-1 text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  aria-expanded={open === e.version}
                  onClick={() => setOpen(open === e.version ? null : e.version)}
                >
                  Details
                </Button>
              </td>
            </tr>
            {open === e.version && (
              <tr>
                <td colSpan={5} className="pb-2">
                  <div className="grid gap-2 md:grid-cols-2">
                    <pre className="max-h-64 overflow-auto rounded bg-muted/40 p-2 font-mono">{json(e.transaction)}</pre>
                    <pre className="max-h-64 overflow-auto rounded bg-muted/40 p-2 font-mono">{json(e.orderSnapshot)}</pre>
                  </div>
                </td>
              </tr>
            )}
          </React.Fragment>
        ))}
      </tbody>
    </table>
  );
}
