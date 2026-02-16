import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { Copy, Check } from 'lucide-react';

interface MermaidDiagramProps {
  chart: string;
  theme?: 'dark' | 'light';
}

export default function MermaidDiagram({ chart, theme = 'dark' }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const renderDiagram = async () => {
      try {
        // Initialize mermaid with theme
        mermaid.initialize({
          startOnLoad: false,
          theme: theme === 'dark' ? 'dark' : 'default',
          themeVariables: {
            fontFamily: 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif',
          },
        });

        // Generate unique ID for this diagram
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;

        // Render the diagram
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
  }, [chart, theme]);

  const handleCopy = () => {
    navigator.clipboard.writeText(chart);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (error) {
    return (
      <div className="relative group my-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <div className="flex items-start justify-between mb-2">
          <span className="text-sm font-semibold text-red-800 dark:text-red-400">
            Mermaid Diagram Error
          </span>
          <button
            onClick={handleCopy}
            className="p-1.5 rounded-md bg-red-100 dark:bg-red-800 hover:bg-red-200 dark:hover:bg-red-700 transition-colors"
            title="Copy diagram source"
          >
            {copied ? (
              <Check className="w-4 h-4 text-red-700 dark:text-red-300" />
            ) : (
              <Copy className="w-4 h-4 text-red-700 dark:text-red-300" />
            )}
          </button>
        </div>
        <pre className="text-sm text-red-700 dark:text-red-400 whitespace-pre-wrap font-mono">
          {error}
        </pre>
      </div>
    );
  }

  return (
    <div className="relative group my-6">
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 p-2 rounded-md bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors opacity-0 group-hover:opacity-100 z-10"
        title="Copy diagram source"
      >
        {copied ? (
          <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
        ) : (
          <Copy className="w-4 h-4 text-gray-600 dark:text-gray-300" />
        )}
      </button>
      <div
        ref={containerRef}
        className="flex justify-center items-center p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-x-auto"
      />
    </div>
  );
}
