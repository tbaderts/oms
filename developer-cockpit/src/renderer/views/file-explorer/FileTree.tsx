import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, File, Folder } from 'lucide-react';
import type { FsEntry } from '@shared/types/fs';
import { cn } from '@/lib/utils';

interface FileTreeProps {
  rootPath: string;
  onFileSelect: (path: string) => void;
}

export function FileTree({ rootPath, onFileSelect }: FileTreeProps) {
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    window.cockpit.fs.readDir(rootPath).then(setEntries).catch(() => setEntries([])).finally(() => setLoading(false));
  }, [rootPath]);

  if (loading) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">Loading...</p>;
  }

  if (entries.length === 0) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">Empty directory</p>;
  }

  return (
    <div className="space-y-0.5">
      {entries.map((entry) => (
        <FileTreeNode key={entry.path} entry={entry} onFileSelect={onFileSelect} depth={0} />
      ))}
    </div>
  );
}

function FileTreeNode({
  entry,
  onFileSelect,
  depth,
}: {
  entry: FsEntry;
  onFileSelect: (path: string) => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FsEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  const toggle = async () => {
    if (!entry.isDirectory) {
      onFileSelect(entry.path);
      return;
    }
    if (!loaded) {
      const entries = await window.cockpit.fs.readDir(entry.path).catch(() => []);
      setChildren(entries);
      setLoaded(true);
    }
    setExpanded(!expanded);
  };

  return (
    <div>
      <button
        onClick={toggle}
        className={cn(
          'flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-sm hover:bg-accent',
        )}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
      >
        {entry.isDirectory ? (
          expanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />
        ) : (
          <span className="w-3" />
        )}
        {entry.isDirectory ? (
          <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <File className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{entry.name}</span>
      </button>
      {expanded && children.length > 0 && (
        <div>
          {children.map((child) => (
            <FileTreeNode key={child.path} entry={child} onFileSelect={onFileSelect} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
