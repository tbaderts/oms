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
            <div key={i} className="h-8 bg-gray-200 dark:bg-gray-700 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (!documents || documents.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500 dark:text-gray-400">
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
      className={`w-full flex items-center gap-1.5 px-2 py-1 text-sm rounded-md transition-colors ${
        selectedDoc === doc.path
          ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100'
          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
    >
      <FileText className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
      <span className="flex-1 text-left truncate">{label}</span>
      {showTrustInTree(doc) && <TrustPill tier={doc.okf?.trustTier} />}
      <StatusPill status={doc.status} />
    </button>
  );

  return (
    <div className="p-2 text-sm">
      {/* View toggle */}
      <div className="flex gap-1 mb-2">
        {(['types', 'folders'] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${
              view === v ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
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
                  <div className="px-2 pt-1 text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">{sub.label}</div>
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
      className={`px-1.5 py-0.5 rounded-full text-[10px] border ${
        active
          ? 'bg-blue-600 border-blue-600 text-white'
          : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
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
        className="w-full flex items-center px-1 py-1 font-medium text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
      >
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <span className="flex-1 text-left ml-1">{label}</span>
        <span className="text-xs text-gray-500">{count}</span>
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
      <div className="flex items-center px-1 py-1 text-gray-800 dark:text-gray-200">
        <button onClick={() => setOpen(!open)} aria-label={open ? 'Collapse' : 'Expand'}>
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <Folder className="w-4 h-4 mx-1 text-blue-500" />
        {node.index ? (
          <button onClick={() => onSelectDoc(node.index!.path)} className="flex-1 text-left font-medium hover:underline" title="Open the folder index">
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
