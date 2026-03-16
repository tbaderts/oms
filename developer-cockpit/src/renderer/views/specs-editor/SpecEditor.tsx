import React, { useCallback } from 'react';
import Editor from '@monaco-editor/react';
import type { SpecFile, SpecValidationResult } from '@shared/types/specs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Save, CheckCircle, AlertCircle } from 'lucide-react';

interface SpecEditorProps {
  file: SpecFile;
  content: string;
  dirty: boolean;
  validation: SpecValidationResult | null;
  onContentChange: (content: string) => void;
  onSave: () => void;
}

export function SpecEditor({ file, content, dirty, validation, onContentChange, onSave }: SpecEditorProps) {
  const language = file.extension === '.avsc' ? 'json' : 'yaml';

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined) {
        onContentChange(value);
      }
    },
    [onContentChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (dirty) onSave();
      }
    },
    [dirty, onSave],
  );

  return (
    <div className="flex flex-1 flex-col" onKeyDown={handleKeyDown}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <span className="text-sm font-medium text-foreground">{file.name}</span>
        {dirty && (
          <Badge variant="outline" className="text-orange-400 border-orange-400">
            Modified
          </Badge>
        )}
        <div className="flex-1" />
        {validation && (
          validation.valid ? (
            <Badge variant="outline" className="text-green-500 border-green-500">
              <CheckCircle className="mr-1 h-3 w-3" />
              Valid
            </Badge>
          ) : (
            <Badge variant="outline" className="text-red-500 border-red-500">
              <AlertCircle className="mr-1 h-3 w-3" />
              {validation.errors.length} error{validation.errors.length !== 1 ? 's' : ''}
            </Badge>
          )
        )}
        <Button size="sm" variant="outline" disabled={!dirty} onClick={onSave}>
          <Save className="mr-1 h-3.5 w-3.5" />
          Save
        </Button>
      </div>

      {/* Validation errors */}
      {validation && !validation.valid && (
        <div className="border-b border-border bg-red-500/10 px-4 py-2">
          {validation.errors.map((err, i) => (
            <p key={i} className="text-xs text-red-400">{err}</p>
          ))}
        </div>
      )}

      {/* Monaco Editor */}
      <div className="flex-1">
        <Editor
          height="100%"
          language={language}
          value={content}
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
