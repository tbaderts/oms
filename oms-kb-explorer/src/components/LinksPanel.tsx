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
        <button onClick={() => onSelectDoc(path)} title={path} className="text-left text-blue-600 dark:text-blue-400 hover:underline">
          {label(path)}
        </button>
      ) : (
        <span title={`${path} does not exist`} className="text-gray-400 line-through">{label(path)}</span>
      )}
    </li>
  );

  return (
    <div className="p-4 border-t border-gray-200 dark:border-gray-700 text-sm space-y-4">
      {links.outgoing.length > 0 && (
        <div>
          <h3 className="flex items-center gap-1 mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            <ArrowRight className="w-3.5 h-3.5" /> Links ({links.outgoing.length})
          </h3>
          <ul className="space-y-0.5">{links.outgoing.map((l) => item(l.target, l.exists))}</ul>
        </div>
      )}
      {links.backlinks.length > 0 && (
        <div>
          <h3 className="flex items-center gap-1 mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            <ArrowLeft className="w-3.5 h-3.5" /> Cited by ({links.backlinks.length})
          </h3>
          <ul className="space-y-0.5">{links.backlinks.map((p) => item(p))}</ul>
        </div>
      )}
    </div>
  );
}
