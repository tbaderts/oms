import React, { useEffect, useRef, useState } from 'react';
import { FileText, MessageSquare, Send, Sparkles, Square, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MarkdownContent } from '@/components/MarkdownContent';
import { useKbChatStore, type KbChatTurn } from '@/stores/kbChat';
import { useKnowledgeBaseStore } from '@/stores/knowledgeBase';
import { RunDetails, SourceEntryDetails, sourceDetailsByPath } from './KbChatDetails';

function Turn({ turn, onOpen }: { turn: KbChatTurn; onOpen: (path: string) => void }) {
  if (turn.role === 'user') {
    return (
      <div className="mb-3 ml-8 rounded-md bg-muted px-3 py-2 text-sm" data-testid="kb-chat-question">
        {turn.text}
      </div>
    );
  }
  // SPEC-0065: each source shows its best match next to its link, and its other matches on demand.
  const details = sourceDetailsByPath(turn.trace);
  return (
    <div className="mb-4 text-sm" data-testid="kb-chat-answer">
      <MarkdownContent content={turn.text || '…'} />
      {turn.sources.length > 0 && (
        <div className="mt-2">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Sources</p>
          <ul className="space-y-1">
            {turn.sources.map((path) => (
              <li key={path} className="flex flex-wrap items-center gap-x-2">
                <button
                  type="button"
                  className="flex items-center gap-1 text-left text-xs text-primary hover:underline"
                  onClick={() => onOpen(path)}
                  aria-label={`Open source ${path}`}
                >
                  <FileText className="h-3 w-3 shrink-0" />
                  {path}
                </button>
                <SourceEntryDetails path={path} detail={details.get(path)} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {turn.trace && <RunDetails trace={turn.trace} />}
    </div>
  );
}

/**
 * Chat with the knowledge base (SPEC-0062): questions go to the configured AI provider, which uses
 * the knowledge server's KB tools over MCP (or local search when it is down). Answers list the
 * documents the tools used as links that open in the KB document viewer.
 */
export function KbChatPanel({ onOpenDocument }: { onOpenDocument?: (path: string) => void } = {}) {
  const { status, running, error, incomplete, source, turns, loadStatus, send, summarise, stop, clear } = useKbChatStore();
  const { selectedDocument, selectDocument } = useKnowledgeBaseStore();
  // The Knowledge Base view switches to the document when a source is opened.
  const openSource = onOpenDocument ?? ((path: string) => void selectDocument(path));
  const [question, setQuestion] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: scrollRef.current.scrollHeight });
  }, [turns]);

  const available = Boolean(status?.available);
  const submit = () => {
    const text = question.trim();
    if (!text || running || !available) return;
    setQuestion('');
    void send(text);
  };

  return (
    <div className="flex h-full flex-col" data-testid="kb-chat-panel">
      <div className="flex items-center justify-between gap-2 border-b border-border p-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          <h2 className="text-sm font-semibold">Ask the knowledge base</h2>
        </div>
        {turns.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clear} disabled={running} aria-label="Clear the conversation">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {source === 'local' && (
        <p className="border-b border-border bg-amber-50 px-3 py-1.5 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300" data-testid="kb-chat-fallback">
          Knowledge server unavailable — using local search
        </p>
      )}

      {selectedDocument && (
        <div className="border-b border-border p-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={!available || running}
            onClick={() => void summarise(selectedDocument.relativePath, selectedDocument.title)}
          >
            <Sparkles className="mr-1 h-4 w-4 shrink-0" />
            Summarise this document
            <span className="ml-1 truncate font-normal text-muted-foreground">({selectedDocument.title})</span>
          </Button>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-auto p-3">
        {turns.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Ask where something is documented, or for a summary of a topic. Answers cite the documents they used.
          </p>
        ) : (
          turns.map((t) => <Turn key={t.id} turn={t} onOpen={openSource} />)
        )}
        {running && <p className="text-xs text-muted-foreground">Thinking…</p>}
        {incomplete && !running && <p className="text-xs text-amber-600 dark:text-amber-400">The answer stopped at the step limit and may be incomplete.</p>}
        {error && !running && (
          <p className="rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300" data-testid="kb-chat-error">
            {error}
          </p>
        )}
      </div>

      <div className="border-t border-border p-3">
        <div className="flex gap-2">
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder={available ? 'Ask a question…' : 'AI not configured'}
            disabled={!available || running}
            aria-label="Knowledge base question"
          />
          {running ? (
            <Button variant="outline" onClick={stop} aria-label="Stop">
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={submit} disabled={!available || !question.trim()} aria-label="Send question">
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
        {status && !available && (
          <p className="mt-1 text-xs text-muted-foreground" data-testid="kb-chat-not-configured">
            {status.reason ?? 'AI not configured.'} Configure the AI provider under Settings → AI.
          </p>
        )}
      </div>
    </div>
  );
}
