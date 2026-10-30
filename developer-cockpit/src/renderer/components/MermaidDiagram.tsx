import React, { useEffect, useId, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useConfigStore } from '@/stores/config';

interface MermaidDiagramProps {
  source: string;
}

type RenderState =
  | { status: 'loading' }
  | { status: 'ok'; svg: string }
  | { status: 'error'; message: string };

// mermaid.initialize is global: run initialize + render pairs one at a time so concurrent diagrams
// (several per document, or a theme switch mid-render) never pick up each other's theme.
let renderQueue: Promise<unknown> = Promise.resolve();
// mermaid.render first removes any element with the target id; a fresh id per attempt keeps it off the SVG on screen.
let renderCount = 0;

function renderMermaid(id: string, source: string, dark: boolean): Promise<string> {
  const next = renderQueue.then(async () => {
    // Loaded on first use so the renderer bundle and startup stay as they were.
    const mermaid = (await import('mermaid')).default;
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'default' });
    try {
      const { svg } = await mermaid.render(id, source);
      return svg;
    } finally {
      // On a parse error mermaid can leave its scratch element behind.
      document.getElementById(`d${id}`)?.remove();
    }
  });
  renderQueue = next.catch(() => undefined);
  return next;
}

/** Renders Mermaid source to SVG text in the light theme, e.g. for a document export. */
export function renderMermaidSvg(source: string): Promise<string> {
  return renderMermaid(`mermaid-export-${++renderCount}`, source, false);
}

/** A ```mermaid block rendered as a diagram, following the cockpit theme; falls back to the source on errors. */
export function MermaidDiagram({ source }: MermaidDiagramProps) {
  const theme = useConfigStore((s) => s.config.general.theme);
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const id = `mermaid-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const [state, setState] = useState<RenderState>({ status: 'loading' });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    renderMermaid(`${id}-${++renderCount}`, source, isDark).then(
      (svg) => { if (!cancelled) setState({ status: 'ok', svg }); },
      (err: unknown) => {
        console.error('Mermaid rendering failed:', err);
        if (!cancelled) setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      },
    );
    return () => { cancelled = true; };
  }, [id, source, isDark]);

  const copySource = () => {
    navigator.clipboard.writeText(source).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      (err: unknown) => console.error('Copying the diagram source failed:', err),
    );
  };

  const copyButton = (
    <button
      type="button"
      onClick={copySource}
      aria-label="Copy diagram source"
      title="Copy diagram source"
      className="absolute right-2 top-2 rounded-md bg-muted p-1.5 text-muted-foreground hover:text-foreground"
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </button>
  );

  if (state.status === 'error') {
    return (
      <div role="alert" className="relative mb-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
        {copyButton}
        <p className="mb-2 font-medium text-destructive">Diagram could not be rendered</p>
        <pre className="mb-2 whitespace-pre-wrap font-mono text-xs text-muted-foreground">{state.message}</pre>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">{source}</pre>
      </div>
    );
  }

  if (state.status === 'loading') {
    return <pre className="mb-3 overflow-x-auto rounded-lg bg-muted p-4 text-sm text-muted-foreground">{source}</pre>;
  }

  return (
    <div className="relative mb-3">
      {copyButton}
      <div
        data-testid="mermaid-diagram"
        className="flex justify-center overflow-x-auto rounded-lg border border-border p-4"
        // Mermaid's output under securityLevel 'strict' is sanitised (DOMPurify, no click handlers).
        dangerouslySetInnerHTML={{ __html: state.svg }}
      />
    </div>
  );
}
