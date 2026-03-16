import React from 'react';
import { cn } from '@/lib/utils';

interface Heading {
  level: number;
  text: string;
  id: string;
}

interface TableOfContentsProps {
  headings: Heading[];
}

export function TableOfContents({ headings }: TableOfContentsProps) {
  const scrollToHeading = (id: string) => {
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        On this page
      </h3>
      <nav className="space-y-0.5">
        {headings.map((heading, index) => (
          <button
            key={`${heading.id}-${index}`}
            onClick={() => scrollToHeading(heading.id)}
            className={cn(
              'block w-full truncate text-left text-xs text-muted-foreground hover:text-foreground transition-colors',
              heading.level === 1 && 'font-medium',
              heading.level === 2 && 'pl-2',
              heading.level === 3 && 'pl-4',
              heading.level >= 4 && 'pl-6',
            )}
          >
            {heading.text}
          </button>
        ))}
      </nav>
    </div>
  );
}
