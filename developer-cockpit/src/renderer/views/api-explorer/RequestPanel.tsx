import React, { useCallback } from 'react';
import Editor from '@monaco-editor/react';
import '@/lib/monaco';
import { Loader2, Send } from 'lucide-react';
import { HTTP_METHODS, SAFE_METHODS, type ApiResponse } from '@shared/apiExplorer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { findOperation, useApiExplorerStore } from '@/stores/apiExplorer';
import { SaveTemplateDialog } from './SaveTemplateDialog';

/** The request editor (method, URL, parameters, headers, body) and the last response. */
export function RequestPanel() {
  const s = useApiExplorerStore();
  const found = findOperation(s.catalog, s.selection);
  const params = found?.op.params.filter((p) => p.in !== 'header') ?? [];
  const blocked = s.sending || !s.url.trim() || Boolean(s.check.parseError) || Boolean(s.check.unresolved?.length);
  const hasBody = !SAFE_METHODS.includes(s.method);

  const onBody = useCallback(
    (value: string | undefined) => {
      if (value !== undefined) s.setBody(value);
    },
    [s.setBody],
  );

  return (
    <div className="space-y-4 p-4">
      <section aria-label="Request" className="rounded-md border">
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
          <select
            aria-label="Method"
            className="h-9 rounded-md border border-input bg-transparent px-2 font-mono text-sm"
            value={s.method}
            onChange={(e) => s.setMethod(e.target.value)}
          >
            {HTTP_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <Input aria-label="URL" className="min-w-[16rem] flex-1 font-mono text-sm" value={s.url} placeholder="http://localhost:8080/path" onChange={(e) => s.setUrl(e.target.value)} />
          <SaveTemplateDialog disabled={!s.url.trim()} />
          <Button size="sm" disabled={blocked} onClick={() => void s.send()}>
            {s.sending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />}
            Send
          </Button>
        </div>

        {found && (
          <div className="space-y-2 border-b px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="font-mono">
                {found.api.name} · {found.op.id}
              </Badge>
              {found.op.summary && <span className="text-muted-foreground">{found.op.summary}</span>}
            </div>
            {found.op.variants.length > 0 && (
              <label className="flex items-center gap-2">
                <span className="w-24 text-muted-foreground">Body variant</span>
                <select
                  aria-label="Body variant"
                  className="h-8 rounded-md border border-input bg-transparent px-2 font-mono"
                  value={s.variant ?? ''}
                  onChange={(e) => s.selectVariant(e.target.value)}
                >
                  {found.op.variants.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {params.length > 0 && (
              <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1">
                {params.map((p) => (
                  <React.Fragment key={`${p.in}:${p.name}`}>
                    <label htmlFor={`param-${p.in}-${p.name}`} className="font-mono text-muted-foreground" title={p.description}>
                      {p.name}
                      {p.required && <span className="text-destructive">*</span>} <span className="opacity-60">({p.in})</span>
                    </label>
                    <Input
                      id={`param-${p.in}-${p.name}`}
                      className="h-8 font-mono text-xs"
                      value={(p.in === 'path' ? s.pathParams : s.queryParams)[p.name] ?? ''}
                      placeholder={p.schema?.enum?.map(String).join(' | ') ?? p.schema?.type ?? ''}
                      onChange={(e) => s.setParam(p.in as 'path' | 'query', p.name, e.target.value)}
                    />
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        )}

        <details className="border-b px-3 py-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground">Headers{s.headersText.trim() ? ` (${s.headersText.trim().split('\n').length})` : ''}</summary>
          <textarea
            aria-label="Headers"
            className="mt-2 min-h-16 w-full rounded-md border border-input bg-transparent px-2 py-1 font-mono text-xs"
            placeholder="Authorization: Bearer {{token}}"
            value={s.headersText}
            onChange={(e) => s.setHeaders(e.target.value)}
          />
        </details>

        {s.notice && <p className="border-b bg-amber-500/10 px-3 py-2 text-xs">{s.notice}</p>}

        {hasBody && (
          <>
            <div className="h-[40vh]">
              <Editor
                height="100%"
                language="json"
                value={s.bodyText}
                onChange={onBody}
                theme="vs-dark"
                options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, tabSize: 2, automaticLayout: true }}
              />
            </div>
            <div className="border-t px-3 py-2 text-xs">
              {s.check.parseError ? (
                <p className="text-destructive">{s.check.parseError}</p>
              ) : s.check.findings.length === 0 ? (
                <p className="text-muted-foreground">{found?.op.requestSchema || s.variant ? 'No findings' : 'No schema to check the body against'}</p>
              ) : (
                <ul aria-label="Findings" className="space-y-0.5 text-amber-600 dark:text-amber-400">
                  {s.check.findings.map((f) => (
                    <li key={`${f.path}:${f.message}`} className="font-mono">
                      {f.path} — {f.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </section>

      {s.response && <ResponsePanel response={s.response} />}
    </div>
  );
}

function problemSummary(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const { title, detail } = body as { title?: unknown; detail?: unknown };
  if (typeof title !== 'string' && typeof detail !== 'string') return null;
  return [title, detail].filter((x) => typeof x === 'string').join(': ');
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
        <pre className="max-h-96 overflow-auto px-3 py-2 font-mono text-xs">
          {typeof response.body === 'string' ? response.body : JSON.stringify(response.body, null, 2)}
        </pre>
      )}
    </section>
  );
}
