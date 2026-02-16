import { useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { FileText, Copy, Check } from 'lucide-react';
import { useState, useEffect } from 'react';
import { kbApi } from '../services/api';
import MermaidDiagram from './MermaidDiagram';

interface DocumentViewerProps {
  selectedDoc: string | null;
  searchQuery?: string;
}

export default function DocumentViewer({ selectedDoc, searchQuery }: DocumentViewerProps) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const { data: document, isLoading } = useQuery({
    queryKey: ['document', selectedDoc],
    queryFn: () => (selectedDoc ? kbApi.readDocument(selectedDoc) : null),
    enabled: !!selectedDoc,
  });

  // Detect theme changes from parent element
  useEffect(() => {
    const detectTheme = () => {
      const isDark = window.document.documentElement.classList.contains('dark');
      setTheme(isDark ? 'dark' : 'light');
    };

    detectTheme();

    // Watch for theme changes
    const observer = new MutationObserver(detectTheme);
    observer.observe(window.document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  if (!selectedDoc) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <FileText className="w-24 h-24 text-gray-300 dark:text-gray-600 mb-4" />
        <h2 className="text-2xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Welcome to KB Explorer
        </h2>
        <p className="text-gray-500 dark:text-gray-400 max-w-md">
          Select a document from the sidebar to start exploring the OMS knowledge base
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
          <div className="space-y-2 mt-8">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-4 bg-gray-200 dark:bg-gray-700 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="flex items-center justify-center h-full text-center p-8">
        <div>
          <p className="text-gray-500 dark:text-gray-400">Failed to load document</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="markdown-content">
        <ReactMarkdown
          components={{
            // Add IDs to headings for TOC navigation
            h1: ({ children, ...props }) => {
              const text = String(children);
              const id = text.toLowerCase().replace(/\s+/g, '-');
              return <h1 id={id} {...props}>{children}</h1>;
            },
            h2: ({ children, ...props }) => {
              const text = String(children);
              const id = text.toLowerCase().replace(/\s+/g, '-');
              return <h2 id={id} {...props}>{children}</h2>;
            },
            h3: ({ children, ...props }) => {
              const text = String(children);
              const id = text.toLowerCase().replace(/\s+/g, '-');
              return <h3 id={id} {...props}>{children}</h3>;
            },
            h4: ({ children, ...props }) => {
              const text = String(children);
              const id = text.toLowerCase().replace(/\s+/g, '-');
              return <h4 id={id} {...props}>{children}</h4>;
            },
            h5: ({ children, ...props }) => {
              const text = String(children);
              const id = text.toLowerCase().replace(/\s+/g, '-');
              return <h5 id={id} {...props}>{children}</h5>;
            },
            h6: ({ children, ...props }) => {
              const text = String(children);
              const id = text.toLowerCase().replace(/\s+/g, '-');
              return <h6 id={id} {...props}>{children}</h6>;
            },
            code({ node, inline, className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || '');
              const codeString = String(children).replace(/\n$/, '');
              const language = match?.[1];

              // Render Mermaid diagrams
              if (!inline && language === 'mermaid') {
                return <MermaidDiagram chart={codeString} theme={theme} />;
              }

              // Render syntax-highlighted code
              return !inline && match ? (
                <div className="relative group">
                  <button
                    onClick={() => handleCopyCode(codeString)}
                    className="absolute right-2 top-2 p-2 rounded-md bg-gray-700 hover:bg-gray-600 transition-colors opacity-0 group-hover:opacity-100"
                    title="Copy code"
                  >
                    {copiedCode === codeString ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-gray-300" />
                    )}
                  </button>
                  <SyntaxHighlighter
                    style={vscDarkPlus}
                    language={language}
                    PreTag="div"
                    {...props}
                  >
                    {codeString}
                  </SyntaxHighlighter>
                </div>
              ) : (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            },
          }}
        >
          {document.content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
