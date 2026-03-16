import React from 'react';
import Editor from '@monaco-editor/react';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useConfigStore } from '@/stores/config';

interface FilePreviewProps {
  path: string;
  content: string;
  loading: boolean;
}

const EXT_LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.json': 'json',
  '.java': 'java',
  '.py': 'python',
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.xml': 'xml',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sql': 'sql',
  '.sh': 'shell',
  '.bash': 'shell',
  '.gradle': 'groovy',
  '.groovy': 'groovy',
  '.kt': 'kotlin',
  '.properties': 'properties',
  '.toml': 'toml',
  '.avsc': 'json',
};

function getLanguage(filePath: string): string {
  const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
  return EXT_LANGUAGE_MAP[ext] || 'plaintext';
}

export function FilePreview({ path, content, loading }: FilePreviewProps) {
  const theme = useConfigStore((s) => s.config.general.theme);

  if (loading) return <LoadingSpinner />;

  const fileName = path.split(/[/\\]/).pop() || path;
  const language = getLanguage(path);
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center border-b border-border px-4 py-2">
        <span className="text-sm font-medium truncate" title={path}>{fileName}</span>
        <span className="ml-2 text-xs text-muted-foreground">{language}</span>
      </div>
      <div className="flex-1">
        <Editor
          height="100%"
          language={language}
          value={content}
          theme={isDark ? 'vs-dark' : 'light'}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            domReadOnly: true,
          }}
          loading={<LoadingSpinner />}
        />
      </div>
    </div>
  );
}
