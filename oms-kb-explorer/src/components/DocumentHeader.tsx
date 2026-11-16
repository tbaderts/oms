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
    <button onClick={() => onSelectDoc(path)} className="text-accent hover:text-accent-hover hover:underline">
      {label}
    </button>
  );

  return (
    <div className="mb-6 rounded-md border border-border bg-surface p-4 text-sm">
      <div className="mb-1.5 text-xs font-medium text-muted">{header.title}</div>
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <TypePill type={header.type} />
        <StatusPill status={header.status} />
        <TrustBadgePill badge={header.trust} />
        {header.stale && <StalePill staleAfter={header.staleAfter} />}
        {header.version && <span className="text-xs text-muted">v{header.version}</span>}
        {header.updated && <span className="text-xs text-muted">updated {header.updated.slice(0, 10)}</span>}
      </div>
      {header.description && <p className="mb-2 text-text">{header.description}</p>}
      {header.keys.length > 0 && (
        <dl className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
          {header.keys.map((k) => (
            <div key={k.label} className="flex gap-1">
              <dt className="text-muted">{k.label}:</dt>
              <dd className="text-strong">{k.path ? link(k.path, k.value) : k.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {header.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {header.tags.map((t) => (
            <span key={t} className="rounded-sm bg-raised px-1.5 py-px text-2xs text-muted">#{t}</span>
          ))}
        </div>
      )}
      {header.sources.length > 0 && (
        <details>
          <summary className="cursor-pointer text-muted hover:text-text">Sources ({header.sources.length})</summary>
          <ul className="mt-1 ml-4 list-disc space-y-0.5">
            {header.sources.map((s, i) => (
              <li key={i}>
                {s.kind === 'doc' && link(s.path, s.path.split('/').slice(1).join('/'))}
                {s.kind === 'repo' && <code className="font-mono text-xs text-muted">{s.path}</code>}
                {s.kind === 'url' && (
                  <a href={s.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:text-accent-hover hover:underline">
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
