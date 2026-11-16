import { useQuery } from '@tanstack/react-query';
import { List } from 'lucide-react';
import { kbApi } from '../services/api';
import { slugify } from '../okf/links';

interface TableOfContentsProps {
  documentPath: string;
}

/** The current document's sections; level-3+ headings are indented under their level-2 parent. */
export default function TableOfContents({ documentPath }: TableOfContentsProps) {
  const { data: sections, isLoading } = useQuery({
    queryKey: ['sections', documentPath],
    queryFn: () => kbApi.listSections(documentPath),
  });

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-4 rounded-sm bg-raised" />
          ))}
        </div>
      </div>
    );
  }

  if (!sections || sections.length === 0) return null;

  return (
    <div className="p-4">
      <h3 className="mb-2 flex items-center gap-1.5 border-b border-border pb-2 text-xs font-semibold text-muted">
        <List className="h-3.5 w-3.5" /> On this page
      </h3>
      <nav className="space-y-px">
        {sections.map((section, index) => (
          <a
            key={index}
            href={`#${slugify(section.title)}`}
            className={`block truncate rounded-sm py-0.5 pr-1 text-sm transition-colors hover:bg-hover hover:text-accent ${
              section.level <= 2 ? 'font-medium text-text' : 'text-muted'
            }`}
            style={{ paddingLeft: `calc(var(--oms-space-1) + ${Math.max(0, section.level - 2)} * var(--oms-space-3))` }}
            title={section.title}
          >
            {section.title}
          </a>
        ))}
      </nav>
    </div>
  );
}
