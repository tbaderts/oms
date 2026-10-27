import React, { useCallback } from 'react';
import Editor from '@monaco-editor/react';
import '@/lib/monaco';
import { AlertTriangle, Loader2, Save } from 'lucide-react';
import { DOCUMENT_FILES } from '@shared/types/specTickets';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useDocEditorStore } from '@/stores/docEditor';

/** Editor for the open stage document in the doc editor store (follows SpecEditor). */
export function DocumentEditor() {
  const { doc, text, dirty, checking, conflict, saving, error, edit, save, reload, confirmLeave } = useDocEditorStore();

  const handleChange = useCallback((value: string | undefined) => {
    if (value !== undefined) edit(value);
  }, [edit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (dirty) save();
    }
  }, [dirty, save]);

  if (!doc) return null;

  return (
    <div className="flex flex-col rounded-md border" onKeyDown={handleKeyDown}>
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className="font-mono text-sm">{DOCUMENT_FILES[doc]}</span>
        {dirty && <Badge variant="outline" className="border-orange-400 text-orange-400">Modified</Badge>}
        {checking && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Checking…
          </span>
        )}
        <div className="flex-1" />
        <Button size="sm" variant="outline" disabled={!dirty || saving} onClick={() => save()}>
          <Save className="mr-1 h-3.5 w-3.5" />
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => confirmLeave()}>Done</Button>
      </div>

      {conflict !== null && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-amber-500/10 px-3 py-2 text-xs">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          <span>This file changed on disk since you opened it. Your edits are not saved.</span>
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={reload}>Reload from disk</Button>
          <Button size="sm" variant="destructive" onClick={() => save(true)}>Overwrite</Button>
        </div>
      )}
      {error && <p className="border-b bg-red-500/10 px-3 py-2 text-xs text-destructive">{error}</p>}

      <div className="h-[60vh]">
        <Editor
          height="100%"
          language="markdown"
          value={text}
          onChange={handleChange}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 2,
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  );
}
