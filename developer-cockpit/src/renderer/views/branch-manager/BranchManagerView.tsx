import React, { useEffect, useState } from 'react';
import { useGitStore } from '@/stores/git';
import { BranchList } from './BranchList';
import { BranchActions } from './BranchActions';

export function BranchManagerView() {
  const { branches, status, refreshBranches, refreshStatus } = useGitStore();
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);

  useEffect(() => {
    refreshBranches();
    refreshStatus();
  }, [refreshBranches, refreshStatus]);

  const currentBranch = branches.find((b) => b.name === selectedBranch) ?? null;
  const defaultBranch = status?.branch === 'main' ? 'main' : 'main';

  return (
    <div className="flex h-full">
      {/* Left panel: Branch list */}
      <div className="w-72 border-r border-border">
        <BranchList
          branches={branches}
          selectedBranch={selectedBranch}
          onSelect={setSelectedBranch}
        />
      </div>

      {/* Right panel: Branch actions */}
      <div className="flex-1 overflow-auto">
        <BranchActions branch={currentBranch} defaultBranch={defaultBranch} />
      </div>
    </div>
  );
}
