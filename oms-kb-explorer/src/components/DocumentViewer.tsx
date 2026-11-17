import { useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { AlertTriangle, FileText, Copy, Check } from 'lucide-react';
import { useState, useEffect } from 'react';
import { omsCodeTheme } from '../theme/codeTheme';
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

  const { data: document, isLoading, error } = useQuery({
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

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  if (!selectedDoc) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <FileText className="mb-3 h-10 w-10 text-muted" />
        <h2 className="mb-1 text-lg font-semibold text-strong">OMS knowledge base</h2>
        <p className="max-w-md text-sm text-muted">
          Pick a document in the tree, or press <kbd className="rounded-sm border border-border-strong bg-raised px-1 font-mono text-xs text-text">/</kbd> to search.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl p-8" aria-busy="true">
        <div className="animate-pulse space-y-3">
          <div className="h-7 w-3/4 rounded-sm bg-raised" />
          <div className="h-4 w-1/2 rounded-sm bg-raised" />
          <div className="mt-6 space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-3.5 rounded-sm bg-raised" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // A failed load names the document and the reason, not an empty pane (SPEC-0066 AC-8)
  if (error || !document) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <div role="alert" className="flex items-start gap-3 rounded-md border border-danger bg-danger-bg px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <div>
            <p className="font-medium text-strong">Could not load {selectedDoc}</p>
            <p className="text-muted">{error instanceof Error ? error.message : 'The document is empty or missing.'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-6">
      <DocumentHeader doc={meta} onSelectDoc={(path) => onSelectDoc(path)} />
      <div className="markdown-content">
        <ReactMarkdown
          // GitHub-flavoured Markdown: tables, strikethrough, task lists and bare-URL links.
          remarkPlugins={[remarkGfm]}
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
                return <MermaidDiagram chart={codeString} />;
              }

              // Render syntax-highlighted code
              return match ? (
                <div className="group relative">
                  <button
                    onClick={() => handleCopyCode(codeString)}
                    className="absolute top-2 right-2 rounded-sm border border-border-strong bg-raised p-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:bg-overlay"
                    title="Copy code"
                    aria-label="Copy code"
                  >
                    {copiedCode === codeString ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5 text-muted" />}
                  </button>
                  <SyntaxHighlighter
                    style={omsCodeTheme}
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
