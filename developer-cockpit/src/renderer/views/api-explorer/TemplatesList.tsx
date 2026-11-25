import React from 'react';
import { templateName } from '@shared/httpFile';
import { useApiExplorerStore } from '@/stores/apiExplorer';
import { MethodTag } from './OperationsList';

/** The requests of the `.http` template files the project lists, per file. */
export function TemplatesList() {
  const { templates, selectTemplate } = useApiExplorerStore();

  if (templates.length === 0) {
    return (
      <p className="p-3 text-xs text-muted-foreground" data-testid="no-templates">
        No template files. List <code>.http</code> files under <code>apiExplorer.templateSources</code> in cockpit.yaml.
      </p>
    );
  }

  return (
    <div className="space-y-4 p-2">
      {templates.map((source) => (
        <section key={source.path} aria-label={`Templates in ${source.path}`}>
          <h2 className="break-all px-2 pb-1 font-mono text-[11px] text-muted-foreground">{source.path}</h2>
          {source.missing && <p className="px-2 text-xs text-amber-600 dark:text-amber-400">missing</p>}
          {source.error && <p className="px-2 text-xs text-destructive">{source.error}</p>}
          <ul className="space-y-0.5">
            {source.file?.requests.map((r) => (
              <li key={r.line}>
                <button
                  type="button"
                  title={`${source.path}, line ${r.line}`}
                  onClick={() => selectTemplate(source.path, r, source.file!.variables)}
                  className="flex w-full items-baseline gap-1 rounded px-2 py-1 text-left hover:bg-accent"
                >
                  <MethodTag method={r.method} />
                  <span className="min-w-0 truncate text-xs">{templateName(r)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
