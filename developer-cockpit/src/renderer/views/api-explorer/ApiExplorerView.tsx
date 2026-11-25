import React, { useCallback, useEffect, useRef } from 'react';
import type { CockpitEvent, FileChangePayload } from '@shared/types/events';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEventBus } from '@/hooks/useEventBus';
import { useApiExplorerStore, type ApiExplorerTab } from '@/stores/apiExplorer';
import { OperationsList } from './OperationsList';
import { TemplatesList } from './TemplatesList';
import { HistoryTab } from './HistoryTab';
import { RequestPanel } from './RequestPanel';

const isSpecFile = (p: string) => /\.(ya?ml|json)$/i.test(p);
const isTemplateFile = (p: string) => /\.http$/i.test(p);

/**
 * The API Explorer (SPEC-0076): the operations of the APIs the project lists in cockpit.yaml, its
 * `.http` templates and the request history on the left; the request editor and the response on
 * the right. Requests are sent from the main process.
 */
export function ApiExplorerView() {
  const { tab, setTab, load, loadCatalog, loadTemplates } = useApiExplorerStore();
  const catalogTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const templatesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void load();
    return () => {
      if (catalogTimer.current) clearTimeout(catalogTimer.current);
      if (templatesTimer.current) clearTimeout(templatesTimer.current);
    };
  }, [load]);

  // The lists follow the specs, cockpit.yaml and the template files on disk; a burst of saves reloads once.
  const onEvent = useCallback(
    (event: CockpitEvent) => {
      if (!event.type.startsWith('file:')) return;
      const path = (event.payload as FileChangePayload).path ?? '';
      if (isSpecFile(path)) {
        if (catalogTimer.current) clearTimeout(catalogTimer.current);
        catalogTimer.current = setTimeout(() => void loadCatalog(), 300);
      }
      if (isTemplateFile(path) || /cockpit\.ya?ml$/i.test(path)) {
        if (templatesTimer.current) clearTimeout(templatesTimer.current);
        templatesTimer.current = setTimeout(() => void loadTemplates(), 300);
      }
    },
    [loadCatalog, loadTemplates],
  );
  useEventBus('*', onEvent);

  return (
    <div className="grid h-full min-h-0 grid-cols-[20rem_1fr]">
      <Tabs value={tab} onValueChange={(v) => setTab(v as ApiExplorerTab)} className="flex min-h-0 flex-col border-r">
        <div className="space-y-2 border-b px-3 pb-2 pt-3">
          <h1 className="text-lg font-semibold">API Explorer</h1>
          <TabsList>
            <TabsTrigger value="operations">Operations</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="operations" className="mt-0 min-h-0 flex-1 overflow-auto">
          <OperationsList />
        </TabsContent>
        <TabsContent value="templates" className="mt-0 min-h-0 flex-1 overflow-auto">
          <TemplatesList />
        </TabsContent>
        <TabsContent value="history" className="mt-0 min-h-0 flex-1 overflow-auto">
          <HistoryTab />
        </TabsContent>
      </Tabs>
      <div className="min-w-0 overflow-auto">
        <RequestPanel />
      </div>
    </div>
  );
}
