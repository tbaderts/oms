import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import type { GitLogEntry } from '@shared/types/git';

interface DiffViewerProps {
  diff: string | null;
  context?: {
    commit?: GitLogEntry;
    filePath?: string;
  };
}

function classifyLine(line: string): string {
  if (line.startsWith('diff --git')) return 'bg-muted font-bold text-foreground';
  if (line.startsWith('@@')) return 'bg-blue-500/10 text-blue-400';
  if (line.startsWith('+') && !line.startsWith('+++')) return 'bg-green-500/10 text-green-400';
  if (line.startsWith('-') && !line.startsWith('---')) return 'bg-red-500/10 text-red-400';
  if (line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) return 'text-muted-foreground';
  return '';
}

export function DiffViewer({ diff, context }: DiffViewerProps) {
  if (!diff) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Select a commit or file to view its diff
      </div>
    );
  }

  const headerText = context?.commit
    ? `${context.commit.hash.substring(0, 7)} ${context.commit.message}`
    : context?.filePath || 'Diff';

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="p-3 pb-0">
        <CardTitle className="truncate text-sm font-medium">{headerText}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full">
          <pre className="p-3 text-xs leading-5">
            {diff.split('\n').map((line, i) => (
              <div key={i} className={`px-2 ${classifyLine(line)}`}>
                {line || ' '}
              </div>
            ))}
          </pre>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
