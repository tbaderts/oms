import React from 'react';
import { cn } from '@/lib/utils';
import { useApiExplorerStore } from '@/stores/apiExplorer';

export const METHOD_TONE: Record<string, string> = {
  GET: 'text-sky-600 dark:text-sky-400',
  POST: 'text-green-600 dark:text-green-400',
  PUT: 'text-amber-600 dark:text-amber-400',
  PATCH: 'text-amber-600 dark:text-amber-400',
  DELETE: 'text-red-600 dark:text-red-400',
};

export function MethodTag({ method }: { method: string }) {
  return <span className={cn('w-14 shrink-0 font-mono text-[11px] font-semibold', METHOD_TONE[method] ?? 'text-muted-foreground')}>{method}</span>;
}

/** The operations of every API in cockpit.yaml, grouped by API. */
export function OperationsList() {
  const { catalog, catalogError, selection, selectOperation } = useApiExplorerStore();

  if (catalogError) return <p className="p-3 text-xs text-destructive">{catalogError}</p>;
  if (!catalog) return <p className="p-3 text-xs text-muted-foreground">Loading…</p>;
  if (catalog.apis.length === 0) {
    return (
      <p className="p-3 text-xs text-muted-foreground" data-testid="no-apis">
        No APIs configured. List OpenAPI specs under <code>apiExplorer.apis</code> in the project&apos;s cockpit.yaml, or send any request from the
        editor.
      </p>
    );
  }

  return (
    <div className="space-y-4 p-2">
      {catalog.apis.map((api) => (
        <section key={api.name} aria-label={`${api.name} operations`}>
          <h2 className="px-2 pb-1 text-xs font-medium uppercase text-muted-foreground" title={`${api.spec} → ${api.baseUrl}`}>
            {api.name}
            {api.title && api.title !== api.name && <span className="ml-1 normal-case">· {api.title}</span>}
          </h2>
          {api.error && <p className="px-2 text-xs text-destructive">{api.error}</p>}
          <ul className="space-y-0.5">
            {api.operations.map((op) => {
              const current = selection?.api === api.name && selection.operation === op.id;
              return (
                <li key={op.id}>
                  <button
                    type="button"
                    aria-current={current ? 'true' : undefined}
                    title={op.summary ?? op.id}
                    onClick={() => selectOperation(api.name, op.id)}
                    className={cn('flex w-full items-baseline gap-1 rounded px-2 py-1 text-left hover:bg-accent', current && 'bg-primary/15 ring-1 ring-primary/40')}
                  >
                    <MethodTag method={op.method} />
                    <span className="min-w-0 truncate font-mono text-xs">{op.path}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
