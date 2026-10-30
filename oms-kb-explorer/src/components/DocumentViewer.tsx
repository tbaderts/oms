import { useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { FileText, Copy, Check } from 'lucide-react';
import { useState, useEffect } from 'react';
import { kbApi } from '../services/api';
import { stripFrontMatter } from '../utils/frontMatter';
import { resolveDocLink, slugify } from '../okf/links';
import DocumentHeader from './DocumentHeader';
import MermaidDiagram from './MermaidDiagram';

interface DocumentViewerProps {
  selectedDoc: string | null;
  anchor?: string;
  onSelectDoc: (path: string, anchor?: string) => void;
}

/** Plain text of a heading's children (inline code and emphasis included). */
function textOf(children: React.ReactNode): string {
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(textOf).join('');
  if (children && typeof children === 'object' && 'props' in children) {
    return textOf((children as { props: { children?: React.ReactNode } }).props.children);
  }
  return '';
}

function scrollToAnchor(anchor: string) {
  window.document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function DocumentViewer({ selectedDoc, anchor, onSelectDoc }: DocumentViewerProps) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const { data: document, isLoading } = useQuery({
    queryKey: ['document', selectedDoc],
    queryFn: () => (selectedDoc ? kbApi.readDocument(selectedDoc) : null),
    enabled: !!selectedDoc,
  });
  const { data: documents } = useQuery({ queryKey: ['documents'], queryFn: () => kbApi.listDocuments() });
  const meta = documents?.find((d) => d.path === selectedDoc);

  // Scroll to the requested anchor once the document is rendered
  useEffect(() => {
    if (document && anchor) {
      const timer = setTimeout(() => scrollToAnchor(anchor), 50);
      return () => clearTimeout(timer);
    }
  }, [document, anchor]);

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
      <DocumentHeader doc={meta} onSelectDoc={(path) => onSelectDoc(path)} />
      <div className="markdown-content">
        <ReactMarkdown
          components={{
            // Add IDs to headings for TOC navigation and in-document anchors
            h1: ({ children, ...props }) => <h1 id={slugify(textOf(children))} {...props}>{children}</h1>,
            h2: ({ children, ...props }) => <h2 id={slugify(textOf(children))} {...props}>{children}</h2>,
            h3: ({ children, ...props }) => <h3 id={slugify(textOf(children))} {...props}>{children}</h3>,
            h4: ({ children, ...props }) => <h4 id={slugify(textOf(children))} {...props}>{children}</h4>,
            h5: ({ children, ...props }) => <h5 id={slugify(textOf(children))} {...props}>{children}</h5>,
            h6: ({ children, ...props }) => <h6 id={slugify(textOf(children))} {...props}>{children}</h6>,
            // Links inside the bundle open in the explorer; external links in a new tab
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            a: ({ node, href, children, ...props }) => {
              const link = resolveDocLink(selectedDoc, href ?? '');
              if (link?.kind === 'external') {
                return <a href={link.href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>;
              }
              if (link?.kind === 'anchor' || link?.kind === 'doc') {
                return (
                  <a
                    href={link.kind === 'anchor' ? `#${link.anchor}` : `#${link.path}`}
                    onClick={(e) => {
                      e.preventDefault();
                      if (link.kind === 'anchor') scrollToAnchor(link.anchor);
                      else onSelectDoc(link.path, link.anchor);
                    }}
                    {...props}
                  >
                    {children}
                  </a>
                );
              }
              return <span title={href} className="underline decoration-dotted">{children}</span>;
            },
            // react-markdown v10 no longer passes `inline`; fenced blocks are the ones with a language class.
            // `node`, `style` and `ref` are pulled out so they are not spread onto SyntaxHighlighter.
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            code({ node, className, children, style, ref, ...props }) {
              const match = /language-(\w+)/.exec(className || '');
              const codeString = String(children).replace(/\n$/, '');
              const language = match?.[1];

              // Render Mermaid diagrams
              if (language === 'mermaid') {
                return <MermaidDiagram chart={codeString} theme={theme} />;
              }

              // Render syntax-highlighted code
              return match ? (
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
                <code className={className} style={style} {...props}>
                  {children}
                </code>
              );
            },
          }}
        >
          {stripFrontMatter(document.content)}
        </ReactMarkdown>
      </div>
    </div>
  );
}
