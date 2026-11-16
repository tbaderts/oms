import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, FileText, Folder, Layers } from 'lucide-react';
import { kbApi } from '../services/api';
import type { DocMeta } from '../types';
import { entryLabel, folderTree, NO_FILTER, showTrustInTree, typeGroups, type Filter, type FolderNode } from '../okf/sidebar';
import { StatusPill, TrustPill } from './Badges';

interface TreeViewProps {
  onSelectDoc: (path: string) => void;
  selectedDoc: string | null;
}

type View = 'types' | 'folders';

const STATUS_OPTIONS = ['stable', 'draft', 'deprecated'];
const TRUST_OPTIONS = ['human-reviewed', 'machine-confirmed', 'unverified'];

export default function TreeView({ onSelectDoc, selectedDoc }: TreeViewProps) {
  const [view, setView] = useState<View>('types');
  const [filter, setFilter] = useState<Filter>(NO_FILTER);
  const { data: documents, isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: () => kbApi.listDocuments(),
  });

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-6 rounded-sm bg-raised" />
          ))}
        </div>
      </div>
    );
  }

  if (!documents || documents.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted">
        No documents found
      </div>
    );
  }

  const toggle = (key: keyof Filter, value: string) =>
    setFilter((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
    }));

  const entry = (doc: DocMeta, label = entryLabel(doc)) => (
    <button
      key={doc.path}
      onClick={() => onSelectDoc(doc.path)}
      title={doc.path}
      className={`flex w-full items-center gap-1.5 rounded-sm border-l-2 px-2 py-1 text-sm transition-colors ${
        selectedDoc === doc.path
          ? 'border-accent bg-selection text-strong'
          : 'border-transparent text-text hover:bg-hover'
      }`}
    >
      <FileText className="h-3.5 w-3.5 shrink-0 text-muted" />
      <span className="flex-1 text-left truncate">{label}</span>
      {showTrustInTree(doc) && <TrustPill tier={doc.okf?.trustTier} />}
      <StatusPill status={doc.status} />
    </button>
  );

  return (
    <div className="p-2 text-sm">
      {/* View toggle */}
      <div role="group" aria-label="Tree view" className="mb-2 flex gap-0.5 rounded-md border border-border bg-bg p-0.5">
        {(['types', 'folders'] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            aria-pressed={view === v}
            className={`flex flex-1 items-center justify-center gap-1 rounded-sm px-2 py-1 text-xs font-medium transition-colors ${
              view === v ? 'bg-accent text-on-accent' : 'text-muted hover:bg-hover hover:text-text'
            }`}
          >
            {v === 'types' ? <Layers className="w-3.5 h-3.5" /> : <Folder className="w-3.5 h-3.5" />}
            {v === 'types' ? 'Types' : 'Folders'}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-1 mb-2">
        {STATUS_OPTIONS.map((s) => (
          <FilterChip key={s} label={s} active={filter.statuses.includes(s)} onClick={() => toggle('statuses', s)} />
        ))}
        {TRUST_OPTIONS.map((t) => (
          <FilterChip key={t} label={t} active={filter.trust.includes(t)} onClick={() => toggle('trust', t)} />
        ))}
      </div>

      {view === 'types' ? (
        typeGroups(documents, filter).map((group) => (
          <Section key={group.type} label={`${group.type}`} count={group.subgroups.reduce((n, s) => n + s.docs.length, 0)}>
            {group.subgroups.map((sub) => (
              <div key={sub.label}>
                {group.subgroups.length > 1 || sub.label !== group.type ? (
                  <div className="px-2 pt-1.5 text-2xs font-medium text-muted">{sub.label}</div>
                ) : null}
                {sub.docs.map((doc) => entry(doc))}
              </div>
            ))}
          </Section>
        ))
      ) : (
        <FolderView node={folderTree(documents, filter)} entry={entry} onSelectDoc={onSelectDoc} root />
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-sm border px-1.5 py-px text-2xs transition-colors ${
        active
          ? 'border-accent bg-accent-bg text-accent'
          : 'border-border-strong text-muted hover:bg-hover hover:text-text'
      }`}
    >
      {label}
    </button>
  );
}

function Section({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center rounded-sm px-1 py-1 font-medium text-strong hover:bg-hover"
      >
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <span className="flex-1 text-left ml-1">{label}</span>
        <span className="text-xs text-muted">{count}</span>
      </button>
      {open && <div className="ml-2 space-y-0.5">{children}</div>}
    </div>
  );
}

interface FolderViewProps {
  node: FolderNode;
  entry: (doc: DocMeta, label?: string) => React.ReactNode;
  onSelectDoc: (path: string) => void;
  root?: boolean;
}

function FolderView({ node, entry, onSelectDoc, root }: FolderViewProps) {
  const [open, setOpen] = useState(true);
  const content = (
    <div className={root ? '' : 'ml-3 space-y-0.5'}>
      {node.folders.map((f) => (
        <FolderView key={f.path} node={f} entry={entry} onSelectDoc={onSelectDoc} />
      ))}
      {node.docs.map((doc) => entry(doc))}
    </div>
  );
  if (root) {
    return (
      <div>
        {node.index && entry(node.index, 'Knowledge base index')}
        {content}
      </div>
    );
  }
  return (
    <div className="mt-0.5">
      <div className="flex items-center px-1 py-1 text-strong">
        <button onClick={() => setOpen(!open)} aria-label={open ? 'Collapse' : 'Expand'}>
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <Folder className="mx-1 h-4 w-4 text-muted" />
        {node.index ? (
          <button onClick={() => onSelectDoc(node.index!.path)} className="flex-1 text-left font-medium hover:text-accent" title="Open the folder index">
            {node.name}
          </button>
        ) : (
          <span className="flex-1 font-medium">{node.name}</span>
        )}
      </div>
      {open && content}
    </div>
  );
}
