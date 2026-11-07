import React, { useEffect, useRef, useState } from 'react';
import { Bot, Send, Square, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { MarkdownContent } from '@/components/MarkdownContent';

import { useAssistantStore, type TranscriptEntry } from '@/stores/assistant';
import { eventBus } from '@/lib/event-bus';

interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  viewportRef?: React.Ref<HTMLDivElement>;
}
const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(({ viewportRef, ...props }, ref) => <div ref={ref} className="flex-1 overflow-auto" {...props} />);


function EntryRow({ entry }: { entry: TranscriptEntry }) {
  if (entry.kind === 'message') {
    return (
      <div className="mb-3 text-sm" data-testid="assistant-message">
        <MarkdownContent content={entry.text || '…'} />
      </div>
    );
  }
  const isCall = entry.kind === 'tool-call';
  return (
    <div className="mb-2 rounded-md border border-border bg-muted/40 text-xs" data-testid="assistant-tool-step">
      <div className="flex items-center justify-between gap-2 p-2">
        <span className="font-medium">
          {isCall ? 'Tool call' : 'Tool result'}: <code>{entry.text}</code>
        </span>
      </div>
      <div className="border-t border-border p-2 font-mono">
        <pre className="whitespace-pre-wrap break-words">{entry.detail ?? ''}</pre>
      </div>
    </div>
  );
}

export function AssistantView() {
  const { status, running, error, incomplete, entries, loadStatus, start, stop, handleEvent, clear } = useAssistantStore();
  const [prompt, setPrompt] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // The transcript reacts to the run's `ai:*` events over the WebSocket, filtered by runId in the store.
  useEffect(() => {
    const off = eventBus.on('ai:message', (e) => handleEvent(e.payload as never));
    const offTool = eventBus.on('ai:tool-call', (e) => handleEvent(e.payload as never));
    const offResult = eventBus.on('ai:tool-result', (e) => handleEvent(e.payload as never));
    const offDone = eventBus.on('ai:done', (e) => handleEvent(e.payload as never));
    const offError = eventBus.on('ai:error', (e) => handleEvent(e.payload as never));
    return () => {
      off();
      offTool();
      offResult();
      offDone();
      offError();
    };
  }, [handleEvent]);

  // Keep the newest entry in view as the transcript grows.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [entries]);

  const submit = () => {
    const text = prompt.trim();
    if (!text || running) return;
    setPrompt('');
    void start(text);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          <div>
            <h1 className="text-lg font-semibold">AI Assistant</h1>
            <p className="text-xs text-muted-foreground">
              {status?.available
                ? `${status.provider} · ${status.model ?? 'configured'}`
                : status?.reason ?? 'AI not configured'}
            </p>
          </div>
        </div>
        {entries.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clear}>
            <Trash2 className="mr-1 h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1" viewportRef={scrollRef}>
        <div className="max-w-3xl p-4">
          {entries.length === 0 ? (
            <div className="flex h-full min-h-40 items-center justify-center text-sm text-muted-foreground">
              Ask a question — the assistant can search the knowledge base and use configured MCP tools.
            </div>
          ) : (
            entries.map((e) => <EntryRow key={e.id} entry={e} />)
          )}
          {running && <p className="text-xs text-muted-foreground">Running…</p>}
          {incomplete && !running && (
            <p className="text-xs text-amber-500 dark:text-amber-400">The run stopped at the maximum number of steps and may be incomplete.</p>
          )}
          {error && !running && (
            <p className="rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300" data-testid="assistant-error">
              {error}
            </p>
          )}
        </div>
      </ScrollArea>

      <div className="border-t border-border p-4">
        <div className="max-w-3xl">
          <div className="flex gap-2">
            <Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder={status?.available ? 'Ask the assistant…' : 'Configure the AI provider in Settings first'}
              disabled={!status?.available || running}
              aria-label="Assistant prompt"
            />
            <Button onClick={submit} disabled={!status?.available || !prompt.trim() || running} aria-label="Send">
              <Send className="h-4 w-4" />
            </Button>
            {running && (
              <Button variant="outline" onClick={stop} aria-label="Stop the run">
                <Square className="h-4 w-4" />
                Stop
              </Button>
            )}
          </div>
          {!status?.available && (
            <p className="mt-1 text-xs text-muted-foreground">
              The AI provider is not configured. Set it under Settings → AI.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
