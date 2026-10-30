import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { MermaidDiagram } from './MermaidDiagram';

interface MarkdownContentProps {
  content: string;
}

/** GitHub-flavoured Markdown with the cockpit's typography (shared by the KB viewer and spec tickets). */
export function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          h1: ({ children }) => <h1 id={headingId(children)} className="text-xl font-bold mt-8 mb-3">{children}</h1>,
          h2: ({ children }) => <h2 id={headingId(children)} className="text-lg font-semibold mt-6 mb-2">{children}</h2>,
          h3: ({ children }) => <h3 id={headingId(children)} className="text-base font-semibold mt-4 mb-2">{children}</h3>,
          p: ({ children }) => <p className="mb-3 leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="mb-3 list-disc pl-6 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 list-decimal pl-6 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          code: ({ className, children, ...props }) => {
            if (MERMAID_CLASS.test(className ?? '')) {
              return <MermaidDiagram source={textOf(children).replace(/\n$/, '')} />;
            }
            const isBlock = className?.includes('language-');
            if (isBlock) {
              return (
                <code className={`${className} block rounded-md bg-muted p-4 text-sm overflow-x-auto`} {...props}>
                  {children}
                </code>
              );
            }
            return <code className="rounded bg-muted px-1.5 py-0.5 text-sm" {...props}>{children}</code>;
          },
          pre: ({ children }) =>
            // A diagram is not preformatted text: render it without the code block's <pre>.
            isMermaidCode(children)
              ? children
              : <pre className="mb-3 overflow-x-auto rounded-lg bg-muted">{children}</pre>,
          table: ({ children }) => (
            <div className="mb-3 overflow-x-auto">
              <table className="w-full border-collapse border border-border text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border border-border bg-muted px-3 py-2 text-left font-medium">{children}</th>,
          td: ({ children }) => <td className="border border-border px-3 py-2">{children}</td>,
          blockquote: ({ children }) => (
            <blockquote className="mb-3 border-l-4 border-primary/30 pl-4 italic text-muted-foreground">{children}</blockquote>
          ),
          a: ({ href, children }) => (
            <a href={href} className="text-primary underline hover:no-underline" target="_blank" rel="noopener noreferrer">{children}</a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

const MERMAID_CLASS = /\blanguage-mermaid\b/;

function isMermaidCode(children: React.ReactNode): boolean {
  return React.isValidElement<{ className?: string }>(children) && MERMAID_CLASS.test(children.props.className ?? '');
}

function textOf(children: React.ReactNode): string {
  return React.Children.toArray(children)
    .map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c)
      : React.isValidElement<{ children?: React.ReactNode }>(c) ? textOf(c.props.children) : ''))
    .join('');
}

function headingId(children: React.ReactNode): string {
  const text = String(children);
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
