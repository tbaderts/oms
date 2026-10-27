import React, { useCallback, useEffect, useRef } from 'react';
import type { CockpitEvent, FileChangePayload } from '@shared/types/events';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEventBus } from '@/hooks/useEventBus';
import { useApiExplorerStore, type ApiExplorerTab } from '@/stores/apiExplorer';
import { CommandsTab } from './CommandsTab';
import { OrdersTab } from './OrdersTab';
import { HistoryTab } from './HistoryTab';

const isContractFile = (p: string) => /[\\/]oms-contracts[\\/].*\.ya?ml$/i.test(p);
const isTemplateFile = (p: string) => /\.http$/i.test(p);

/** OMS-aware console for oms-core: commands from the contracts, the order they touch, queries (SPEC-0007). */
export function ApiExplorerView() {
  const { tab, setTab, baseUrl, local, catalog, load, loadCatalog, loadTemplates } = useApiExplorerStore();
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const templatesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void load();
    return () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      if (templatesTimer.current) clearTimeout(templatesTimer.current);
    };
  }, [load]);

  // The command list follows the contracts and the template files on disk; a burst of saves reloads once.
  const onEvent = useCallback(
    (event: CockpitEvent) => {
      if (!event.type.startsWith('file:')) return;
      const path = (event.payload as FileChangePayload).path ?? '';
      if (isContractFile(path)) {
        if (reloadTimer.current) clearTimeout(reloadTimer.current);
        reloadTimer.current = setTimeout(() => void loadCatalog(), 300);
      } else if (isTemplateFile(path)) {
        if (templatesTimer.current) clearTimeout(templatesTimer.current);
        templatesTimer.current = setTimeout(() => void loadTemplates(), 300);
      }
    },
    [loadCatalog, loadTemplates],
  );
  useEventBus('*', onEvent);

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as ApiExplorerTab)} className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 pt-2">
        <h1 className="text-lg font-semibold">API Explorer</h1>
        <TabsList>
          <TabsTrigger value="commands">Commands</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <div className="flex-1" />
        {baseUrl && <span className="font-mono text-xs text-muted-foreground">oms-core: {baseUrl}</span>}
        {baseUrl && !local && (
          <Badge variant="outline" className="border-amber-500 text-amber-500">
            non-local
          </Badge>
        )}
      </div>
      {catalog?.error && (
        <p role="alert" className="border-b bg-red-500/10 px-4 py-2 text-xs text-destructive">
          Contracts could not be read: {catalog.error}
        </p>
      )}
      <TabsContent value="commands" className="mt-0 min-h-0 flex-1 overflow-auto">
        <CommandsTab />
      </TabsContent>
      <TabsContent value="orders" className="mt-0 min-h-0 flex-1 overflow-auto">
        <OrdersTab />
      </TabsContent>
      <TabsContent value="history" className="mt-0 min-h-0 flex-1 overflow-auto">
        <HistoryTab />
      </TabsContent>
    </Tabs>
  );
}
