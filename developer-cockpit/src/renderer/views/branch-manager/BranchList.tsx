import React from 'react';
import { Check, Globe } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { GitBranch } from '@shared/types/git';

interface BranchListProps {
  branches: GitBranch[];
  selectedBranch: string | null;
  onSelect: (name: string) => void;
}

function formatDate(dateString: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diffDays < 1) return 'today';
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function BranchList({ branches, selectedBranch, onSelect }: BranchListProps) {
  const localBranches = branches.filter((b) => !b.remote);
  const remoteBranches = branches.filter((b) => b.remote);

  return (
    <ScrollArea className="h-full">
      <div className="p-2">
        <h4 className="mb-1 px-2 text-xs font-medium uppercase text-muted-foreground">
          Local Branches ({localBranches.length})
        </h4>
        {localBranches.map((branch) => (
          <button
            key={branch.name}
            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted/50 ${
              selectedBranch === branch.name ? 'bg-muted' : ''
            }`}
            onClick={() => onSelect(branch.name)}
          >
            {branch.current ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-green-400" />
            ) : (
              <span className="h-3.5 w-3.5 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-xs font-medium">{branch.name}</div>
              {branch.lastCommit && (
                <div className="truncate text-xs text-muted-foreground">
                  {branch.lastCommit.substring(0, 7)} {formatDate(branch.lastCommitDate)}
                </div>
              )}
            </div>
          </button>
        ))}

        {remoteBranches.length > 0 && (
          <>
            <h4 className="mb-1 mt-4 px-2 text-xs font-medium uppercase text-muted-foreground">
              Remote Branches ({remoteBranches.length})
            </h4>
            {remoteBranches.map((branch) => (
              <button
                key={branch.name}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted/50 ${
                  selectedBranch === branch.name ? 'bg-muted' : ''
                }`}
                onClick={() => onSelect(branch.name)}
              >
                <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-xs">{branch.name}</div>
                </div>
              </button>
            ))}
          </>
        )}
      </div>
    </ScrollArea>
  );
}
