import React, { useCallback, useMemo } from 'react';
import Editor from '@monaco-editor/react';
import '@/lib/monaco';
import { Loader2, Send } from 'lucide-react';
import type { ApiResponse } from '@shared/apiExplorer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { classifyTemplates } from '@/lib/api-templates';
import { cn } from '@/lib/utils';
import { useApiExplorerStore } from '@/stores/apiExplorer';
import { OrderFollowUp } from './OrderFollowUp';
import { SaveTemplateDialog } from './SaveTemplateDialog';

export function CommandsTab() {
  const { catalog, templates, selectedType, bodyText, check, sending, lastCommand, restoredNotice, selectType, selectTemplate, setBody, send } =
    useApiExplorerStore();
  const { byType, unusable } = useMemo(() => classifyTemplates(templates, catalog?.commandTypes ?? []), [templates, catalog]);
  const problems = [
    ...templates.filter((s) => s.missing || s.error).map((s) => ({ key: s.path, label: s.path, reason: s.missing ? 'missing' : s.error! })),
    ...unusable.map((u) => ({ key: `${u.source}:${u.line}`, label: `${u.name} (${u.source}, line ${u.line})`, reason: u.reason })),
  ];
  const blocked = sending || Boolean(check.parseError) || Boolean(check.unresolved?.length);

  const handleChange = useCallback((value: string | undefined) => {
    if (value !== undefined) setBody(value);
  }, [setBody]);

  return (
    <div className="grid min-h-full grid-cols-[13rem_1fr]">
      <nav className="border-r p-2">
        <h2 className="px-2 pb-2 text-xs font-medium uppercase text-muted-foreground">Command type</h2>
        <ul aria-label="Command types" className="space-y-0.5">
          {(catalog?.commandTypes ?? []).map((type) => (
            <li key={type}>
              <button
                type="button"
                aria-current={type === selectedType ? 'true' : undefined}
                onClick={() => selectType(type)}
                className={cn(
                  'w-full truncate rounded px-2 py-1 text-left font-mono text-xs hover:bg-accent',
                  type === selectedType && 'bg-primary/15 text-foreground ring-1 ring-primary/40',
                )}
              >
                {type}
              </button>
              {byType[type] && (
                <ul aria-label={`Templates for ${type}`} className="ml-3 border-l pl-1">
                  {byType[type].map((t) => (
                    <li key={`${t.source}:${t.line}`}>
                      <button
                        type="button"
                        title={`${t.source}, line ${t.line}`}
                        onClick={() => selectTemplate(t)}
                        className="w-full truncate rounded px-2 py-0.5 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        {t.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
        {problems.length > 0 && (
          <>
            <h2 className="px-2 pb-1 pt-4 text-xs font-medium uppercase text-muted-foreground">Template files</h2>
            <ul aria-label="Template problems" className="space-y-1 px-2 text-xs">
              {problems.map((p) => (
                <li key={p.key} className="break-words">
                  <span className="font-mono">{p.label}</span>: <span className="text-amber-600 dark:text-amber-400">{p.reason}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </nav>

      <div className="min-w-0 space-y-4 p-4">
        {!selectedType ? (
          <p className="text-sm text-muted-foreground">
            Pick a command type to start from a template built from its contract, or one of the saved templates listed under it.
          </p>
        ) : (
          <section aria-label="Command" className="rounded-md border">
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <span className="font-mono text-sm">POST /api/command/execute</span>
              <Badge variant="secondary" className="font-mono">{selectedType}</Badge>
              <div className="flex-1" />
              <SaveTemplateDialog />
              <Button size="sm" disabled={blocked} onClick={() => void send()}>
                {sending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />}
                Send
              </Button>
            </div>
            {restoredNotice && <p className="border-b bg-amber-500/10 px-3 py-2 text-xs">{restoredNotice}</p>}
            <div className="h-[45vh]">
              <Editor
                height="100%"
                language="json"
                value={bodyText}
                onChange={handleChange}
                theme="vs-dark"
                options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, tabSize: 2, automaticLayout: true }}
              />
            </div>
            <div className="border-t px-3 py-2 text-xs">
              {check.parseError ? (
                <p className="text-destructive">{check.parseError}</p>
              ) : check.findings.length === 0 ? (
                <p className="text-muted-foreground">No findings</p>
              ) : (
                <ul aria-label="Findings" className="space-y-0.5 text-amber-600 dark:text-amber-400">
                  {check.findings.map((f) => (
                    <li key={`${f.path}:${f.message}`} className="font-mono">
                      {f.path} — {f.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {lastCommand && <ResponsePanel response={lastCommand.response} />}
        <OrderFollowUp />
      </div>
    </div>
  );
}

function problemSummary(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const { title, detail } = body as { title?: unknown; detail?: unknown };
  if (typeof title !== 'string' && typeof detail !== 'string') return null;
  return [title, detail].filter((s) => typeof s === 'string').join(': ');
}

export function ResponsePanel({ response, label = 'Response' }: { response: ApiResponse; label?: string }) {
  const problem = /problem\+json/.test(response.contentType) ? problemSummary(response.body) : null;
  return (
    <section aria-label={label} className="rounded-md border">
      <div className="flex items-center gap-2 border-b px-3 py-2 text-sm">
        <span className="font-medium">{label}</span>
        {response.status !== null && (
          <Badge variant={response.ok ? 'secondary' : 'destructive'} className="font-mono">
            {response.status}
          </Badge>
        )}
        <span className="text-xs text-muted-foreground">{response.durationMs} ms</span>
      </div>
      {response.error && (
        <p role="alert" className="border-b bg-red-500/10 px-3 py-2 text-xs text-destructive">
          {response.error}
        </p>
      )}
      {problem && <p className="border-b px-3 py-2 text-sm">{problem}</p>}
      {response.body !== null && response.body !== '' && (
        <pre className="max-h-80 overflow-auto px-3 py-2 font-mono text-xs">
          {typeof response.body === 'string' ? response.body : JSON.stringify(response.body, null, 2)}
        </pre>
      )}
    </section>
  );
}
