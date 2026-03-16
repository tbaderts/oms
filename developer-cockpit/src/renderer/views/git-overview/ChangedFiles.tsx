import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import type { GitStatus, GitStatusFile } from '@shared/types/git';

interface ChangedFilesProps {
  status: GitStatus;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  M: { label: 'M', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  A: { label: 'A', className: 'bg-green-500/20 text-green-400 border-green-500/30' },
  D: { label: 'D', className: 'bg-red-500/20 text-red-400 border-red-500/30' },
  R: { label: 'R', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  C: { label: 'C', className: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  U: { label: 'U', className: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  '?': { label: '?', className: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  '!': { label: '!', className: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
};

function FileEntry({
  file,
  selected,
  onClick,
}: {
  file: GitStatusFile;
  selected: boolean;
  onClick: () => void;
}) {
  const style = STATUS_STYLES[file.status] || STATUS_STYLES['?'];
  return (
    <button
      className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted/50 ${
        selected ? 'bg-muted' : ''
      }`}
      onClick={onClick}
    >
      <Badge variant="outline" className={`h-5 w-5 justify-center p-0 text-xs ${style.className}`}>
        {style.label}
      </Badge>
      <span className="truncate font-mono text-xs">{file.path}</span>
    </button>
  );
}

function FileSection({
  title,
  files,
  selectedPath,
  onSelect,
}: {
  title: string;
  files: GitStatusFile[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  if (files.length === 0) return null;
  return (
    <div className="mb-3">
      <h4 className="mb-1 px-2 text-xs font-medium uppercase text-muted-foreground">
        {title} ({files.length})
      </h4>
      {files.map((file) => (
        <FileEntry
          key={file.path}
          file={file}
          selected={selectedPath === file.path}
          onClick={() => onSelect(file.path)}
        />
      ))}
    </div>
  );
}

export function ChangedFiles({ status, selectedPath, onSelect }: ChangedFilesProps) {
  const totalChanges =
    status.staged.length + status.unstaged.length + status.untracked.length + status.conflicted.length;

  if (totalChanges === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No changed files
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-2">
        <FileSection title="Staged" files={status.staged} selectedPath={selectedPath} onSelect={onSelect} />
        <FileSection title="Unstaged" files={status.unstaged} selectedPath={selectedPath} onSelect={onSelect} />
        <FileSection title="Untracked" files={status.untracked} selectedPath={selectedPath} onSelect={onSelect} />
        <FileSection title="Conflicted" files={status.conflicted} selectedPath={selectedPath} onSelect={onSelect} />
      </div>
    </ScrollArea>
  );
}
