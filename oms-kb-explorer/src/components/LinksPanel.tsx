import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { kbApi } from '../services/api';
import type { DocMeta } from '../types';
import { displayTitle } from '../okf/sidebar';

interface LinksPanelProps {
  documentPath: string;
  onSelectDoc: (path: string) => void;
}

/** Outgoing links and "cited by" of the current document. */
export default function LinksPanel({ documentPath, onSelectDoc }: LinksPanelProps) {
  const { data: links } = useQuery({
    queryKey: ['links', documentPath],
    queryFn: () => kbApi.getLinks(documentPath),
  });
  const { data: documents } = useQuery({ queryKey: ['documents'], queryFn: () => kbApi.listDocuments() });
  const byPath = new Map((documents ?? []).map((d: DocMeta) => [d.path, d]));
  const label = (path: string) => {
    const doc = byPath.get(path);
    return doc ? displayTitle(doc) : path.split('/').pop() ?? path;
  };

  if (!links || (links.outgoing.length === 0 && links.backlinks.length === 0)) return null;

  const item = (path: string, exists = true) => (
    <li key={path}>
      {exists ? (
        <button
          onClick={() => onSelectDoc(path)}
          title={path}
          className="w-full truncate rounded-sm px-1 py-0.5 text-left text-accent hover:bg-hover hover:text-accent-hover"
        >
          {label(path)}
        </button>
      ) : (
        <span title={`${path} does not exist`} className="block truncate px-1 py-0.5 text-muted line-through">
          {label(path)}
        </span>
      )}
    </li>
  );

  const heading = (icon: React.ReactNode, text: string) => (
    <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted">
      {icon} {text}
    </h3>
  );

  return (
    <div className="space-y-4 border-t border-border p-4 text-sm">
      {links.outgoing.length > 0 && (
        <div>
          {heading(<ArrowRight className="h-3.5 w-3.5" />, `Links (${links.outgoing.length})`)}
          <ul>{links.outgoing.map((l) => item(l.target, l.exists))}</ul>
        </div>
      )}
      {links.backlinks.length > 0 && (
        <div>
          {heading(<ArrowLeft className="h-3.5 w-3.5" />, `Cited by (${links.backlinks.length})`)}
          <ul>{links.backlinks.map((p) => item(p))}</ul>
        </div>
      )}
    </div>
  );
}
