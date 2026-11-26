import React, { useEffect, useState } from 'react';
import { useKnowledgeBaseStore } from '@/stores/knowledgeBase';
import { KbTree } from './KbTree';
import { DocumentViewer } from './DocumentViewer';
import { TableOfContents } from './TableOfContents';
import { KbSearchBar } from './KbSearchBar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { FileText, HeartPulse, MessageSquare } from 'lucide-react';
import { KbChatPanel } from './KbChatPanel';
import { KbHealthPanel } from './KbHealthPanel';

/** What the centre pane shows: the open document, the KB chat (SPEC-0062) or the health panel (SPEC-0064). */
type CentreView = 'document' | 'chat' | 'health';

const VIEWS: { id: CentreView; label: string; icon: typeof FileText }[] = [
  { id: 'document', label: 'Document', icon: FileText },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'health', label: 'Health', icon: HeartPulse },
];

export function KnowledgeBaseView() {
  const { categories, selectedDocument, loading, loadCategories, selectDocument } = useKnowledgeBaseStore();
  const [tocHeadings, setTocHeadings] = useState<{ level: number; text: string; id: string }[]>([]);
  // One pane at a time, so the chat and the health panel get the full width. The chat keeps its
  // conversation in its store, so switching away and back loses nothing.
  const [view, setView] = useState<CentreView>('document');

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  /** Picking a document in the tree, the search, a chat source or a finding shows it. */
  const openDocument = (path: string) => {
    setView('document');
    void selectDocument(path);
  };

  /** A finding opens its document only if the explorer has it (a missing index.md is not one yet). */
  const openFinding = async (path: string): Promise<boolean> => {
    const doc = await window.cockpit.kb.getDocument(path);
    if (!doc) return false;
    openDocument(path);
    return true;
  };

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
      {/* Left panel - search, and the tree by folder or by type */}
      <div className="flex w-64 flex-col border-r border-border">
        <div className="border-b border-border p-3">
          <KbSearchBar onSelect={openDocument} />
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2">
            <KbTree categories={categories} onSelect={openDocument} />
          </div>
        </ScrollArea>
      </div>

      {/* Centre - the document, the chat or the health panel */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1 border-b border-border px-3 py-2" role="group" aria-label="Knowledge base pane">
          {VIEWS.map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              variant={view === id ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setView(id)}
              aria-pressed={view === id}
            >
              <Icon className="mr-1 h-4 w-4" />
              {label}
            </Button>
          ))}
          {view !== 'document' && selectedDocument && (
            <span className="ml-auto truncate text-xs text-muted-foreground">Open: {selectedDocument.title}</span>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {view === 'health' ? (
            <ScrollArea className="h-full">
              <div className="max-w-5xl p-6">
                <KbHealthPanel onOpenDocument={openFinding} onIndexesFixed={() => void loadCategories()} />
              </div>
            </ScrollArea>
          ) : view === 'chat' ? (
            <div className="mx-auto h-full max-w-4xl">
              <KbChatPanel onOpenDocument={openDocument} />
            </div>
          ) : loading ? (
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
      </div>

      {/* Right panel - table of contents of the open document */}
      {view === 'document' && selectedDocument && tocHeadings.length > 0 && (
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
