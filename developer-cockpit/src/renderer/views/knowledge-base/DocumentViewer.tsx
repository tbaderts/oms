import React from 'react';
import type { KbDocument } from '@shared/types/kb';
import { Badge } from '@/components/ui/badge';
import { MarkdownContent } from '@/components/MarkdownContent';

interface DocumentViewerProps {
  document: KbDocument;
}

export function DocumentViewer({ document }: DocumentViewerProps) {
  return (
    <article>
      <header className="mb-6">
        <h1 className="text-2xl font-bold">{document.title}</h1>
        <div className="mt-2 flex items-center gap-2">
          <Badge variant="secondary">{document.category}</Badge>
          <span className="text-xs text-muted-foreground">
            {new Date(document.lastModified).toLocaleDateString()}
          </span>
        </div>
      </header>

      <MarkdownContent content={document.content} />
    </article>
  );
}
