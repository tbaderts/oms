import React, { useEffect, useState } from 'react';
import { useKnowledgeBaseStore } from '@/stores/knowledgeBase';
import { CategoryTree } from './CategoryTree';
import { DocumentViewer } from './DocumentViewer';
import { TableOfContents } from './TableOfContents';
import { KbSearchBar } from './KbSearchBar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LoadingSpinner } from '@/components/LoadingSpinner';

export function KnowledgeBaseView() {
  const { categories, selectedDocument, loading, loadCategories, selectDocument } = useKnowledgeBaseStore();
  const [tocHeadings, setTocHeadings] = useState<{ level: number; text: string; id: string }[]>([]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    if (selectedDocument) {
      const headings: { level: number; text: string; id: string }[] = [];
      const regex = /^(#{1,6})\s+(.+)$/gm;
      let match;
      while ((match = regex.exec(selectedDocument.content)) !== null) {
        const text = match[2].trim();
        headings.push({
          level: match[1].length,
          text,
          id: text.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        });
      }
      setTocHeadings(headings);
    }
  }, [selectedDocument]);

  return (
    <div className="flex h-full">
      {/* Left panel - Category tree and search */}
      <div className="flex w-64 flex-col border-r border-border">
        <div className="border-b border-border p-3">
          <KbSearchBar onSelect={(path) => selectDocument(path)} />
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2">
            <CategoryTree categories={categories} onSelect={(path) => selectDocument(path)} />
          </div>
        </ScrollArea>
      </div>

      {/* Center - Document content */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <LoadingSpinner />
        ) : selectedDocument ? (
          <ScrollArea className="h-full">
            <div className="max-w-4xl p-6">
              <DocumentViewer document={selectedDocument} />
            </div>
          </ScrollArea>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <p>Select a document to view</p>
          </div>
        )}
      </div>

      {/* Right panel - Table of contents */}
      {selectedDocument && tocHeadings.length > 0 && (
        <div className="hidden w-52 border-l border-border lg:block">
          <ScrollArea className="h-full">
            <div className="p-3">
              <TableOfContents headings={tocHeadings} />
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
