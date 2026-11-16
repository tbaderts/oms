import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { AlertTriangle, Copy, Check } from 'lucide-react';

interface MermaidDiagramProps {
  chart: string;
}

/** A token's current value: mermaid derives shades from concrete colours, so it cannot take var(). */
function tokenValue(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--oms-${name}`).trim();
}

/** Mermaid's base theme on the OMS tokens (SPEC-0066): slate nodes, light text, the accent for lines. */
function omsMermaidTheme() {
  return {
    darkMode: true,
    background: tokenValue('surface'),
    fontFamily: tokenValue('font-family'),
    primaryColor: tokenValue('surface-overlay'),
    primaryTextColor: tokenValue('text-strong'),
    primaryBorderColor: tokenValue('border-hover'),
    secondaryColor: tokenValue('surface-raised'),
    tertiaryColor: tokenValue('surface'),
    lineColor: tokenValue('text-muted'),
    textColor: tokenValue('text'),
    mainBkg: tokenValue('surface-overlay'),
    nodeBorder: tokenValue('border-hover'),
    clusterBkg: tokenValue('surface-raised'),
    clusterBorder: tokenValue('border-strong'),
    edgeLabelBackground: tokenValue('surface-raised'),
    actorBkg: tokenValue('surface-overlay'),
    actorBorder: tokenValue('accent'),
    actorTextColor: tokenValue('text-strong'),
    signalColor: tokenValue('text'),
    signalTextColor: tokenValue('text'),
    labelBoxBkgColor: tokenValue('surface-raised'),
    noteBkgColor: tokenValue('surface-raised'),
    noteTextColor: tokenValue('text'),
    noteBorderColor: tokenValue('warning'),
  };
}

export default function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const renderDiagram = async () => {
      try {
        mermaid.initialize({ startOnLoad: false, theme: 'base', themeVariables: omsMermaidTheme() });
        const id = `mermaid-${Math.random().toString(36).slice(2, 11)}`;
        const { svg } = await mermaid.render(id, chart);
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
          setError(null);
        }
      } catch (err) {
        console.error('Mermaid rendering error:', err);
        setError(err instanceof Error ? err.message : 'Failed to render diagram');
      }
    };

    renderDiagram();
  }, [chart]);

  const handleCopy = () => {
    navigator.clipboard.writeText(chart);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyButton = (extra: string) => (
    <button
      onClick={handleCopy}
      className={`rounded-sm border border-border-strong bg-raised p-1.5 hover:bg-overlay ${extra}`}
      title="Copy diagram source"
      aria-label="Copy diagram source"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5 text-muted" />}
    </button>
  );

  if (error) {
    return (
      <div className="my-4 rounded-md border border-danger bg-danger-bg p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <span className="flex items-center gap-1.5 text-sm font-medium text-strong">
            <AlertTriangle className="h-4 w-4 text-danger" /> Mermaid diagram error
          </span>
          {copyButton('')}
        </div>
        <pre className="font-mono text-sm whitespace-pre-wrap text-text">{error}</pre>
      </div>
    );
  }

  return (
    <div className="group relative my-6">
      {copyButton('absolute top-2 right-2 z-10 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100')}
      <div ref={containerRef} className="flex items-center justify-center overflow-x-auto rounded-md border border-border bg-surface p-6" />
    </div>
  );
}
