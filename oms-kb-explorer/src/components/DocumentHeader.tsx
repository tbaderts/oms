import { ExternalLink } from 'lucide-react';
import type { DocMeta } from '../types';
import { documentHeader } from '../okf/header';
import { StalePill, StatusPill, TrustBadgePill, TypePill } from './Badges';

interface DocumentHeaderProps {
  doc?: DocMeta;
  onSelectDoc: (path: string) => void;
}

/** OKF metadata above a document's body; nothing for documents without front matter. */
export default function DocumentHeader({ doc, onSelectDoc }: DocumentHeaderProps) {
  const header = documentHeader(doc);
  if (!header) return null;

  const link = (path: string, label: string) => (
    <button onClick={() => onSelectDoc(path)} className="text-blue-600 dark:text-blue-400 hover:underline">
      {label}
    </button>
  );

  return (
    <div className="mb-6 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm">
      <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">{header.title}</div>
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <TypePill type={header.type} />
        <StatusPill status={header.status} />
        <TrustBadgePill badge={header.trust} />
        {header.stale && <StalePill staleAfter={header.staleAfter} />}
        {header.version && <span className="text-xs text-gray-500">v{header.version}</span>}
        {header.updated && <span className="text-xs text-gray-500">updated {header.updated.slice(0, 10)}</span>}
      </div>
      {header.description && <p className="text-gray-700 dark:text-gray-300 mb-2">{header.description}</p>}
      {header.keys.length > 0 && (
        <dl className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
          {header.keys.map((k) => (
            <div key={k.label} className="flex gap-1">
              <dt className="text-gray-500">{k.label}:</dt>
              <dd className="text-gray-900 dark:text-gray-100">{k.path ? link(k.path, k.value) : k.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {header.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {header.tags.map((t) => (
            <span key={t} className="text-[11px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">#{t}</span>
          ))}
        </div>
      )}
      {header.sources.length > 0 && (
        <details>
          <summary className="cursor-pointer text-gray-500">Sources ({header.sources.length})</summary>
          <ul className="mt-1 ml-4 list-disc space-y-0.5">
            {header.sources.map((s, i) => (
              <li key={i}>
                {s.kind === 'doc' && link(s.path, s.path.split('/').slice(1).join('/'))}
                {s.kind === 'repo' && <code className="text-xs">{s.path}</code>}
                {s.kind === 'url' && (
                  <a href={s.href} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1">
                    {s.href} <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {s.kind === 'text' && <span>{s.value}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
