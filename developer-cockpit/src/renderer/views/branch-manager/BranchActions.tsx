import React, { useState } from 'react';
import { ArrowUp, ArrowDown, GitMerge, Trash2, ArrowRightLeft, Plus } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useGitStore } from '@/stores/git';
import type { GitBranch } from '@shared/types/git';

interface BranchActionsProps {
  branch: GitBranch | null;
  defaultBranch: string;
}

export function BranchActions({ branch, defaultBranch }: BranchActionsProps) {
  const { createBranch, checkoutBranch, deleteBranch } = useGitStore();
  const [newBranchName, setNewBranchName] = useState('');
  const [actionMessage, setActionMessage] = useState<{ text: string; success: boolean } | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [forceDelete, setForceDelete] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const handleCreate = async () => {
    if (!newBranchName.trim()) return;
    setActionLoading(true);
    const result = await createBranch(newBranchName.trim());
    setActionMessage({ text: result.message, success: result.success });
    if (result.success) setNewBranchName('');
    setActionLoading(false);
  };

  const handleCheckout = async () => {
    if (!branch || branch.current) return;
    setActionLoading(true);
    const result = await checkoutBranch(branch.name);
    setActionMessage({ text: result.message, success: result.success });
    setActionLoading(false);
  };

  const handleDelete = async () => {
    if (!branch) return;
    setActionLoading(true);
    const result = await deleteBranch(branch.name, forceDelete);
    setActionMessage({ text: result.message, success: result.success });
    setDeleteDialogOpen(false);
    setForceDelete(false);
    setActionLoading(false);
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Branch detail */}
      {branch ? (
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="font-mono text-sm">{branch.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0">
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {branch.lastCommit && (
                <span>Last commit: <span className="font-mono">{branch.lastCommit.substring(0, 7)}</span></span>
              )}
            </div>

            {branch.current && !branch.remote && (
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1">
                  <ArrowUp className="h-3 w-3" /> Ahead: {branch.aheadDefault}
                </span>
                <span className="flex items-center gap-1">
                  <ArrowDown className="h-3 w-3" /> Behind: {branch.behindDefault}
                </span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <GitMerge className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs">
                Merged into {defaultBranch}: {' '}
                <Badge variant={branch.merged ? 'secondary' : 'outline'} className="text-xs">
                  {branch.merged ? 'Yes' : 'No'}
                </Badge>
              </span>
            </div>

            {!branch.remote && (
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCheckout}
                  disabled={branch.current || actionLoading}
                >
                  <ArrowRightLeft className="mr-1 h-3.5 w-3.5" />
                  Switch
                </Button>

                <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={branch.current || branch.name === defaultBranch || actionLoading}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Delete branch '{branch.name}'?</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                      This will delete the local branch. This action cannot be undone.
                    </p>
                    {!branch.merged && (
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={forceDelete}
                          onChange={(e) => setForceDelete(e.target.checked)}
                          className="rounded"
                        />
                        Force delete (branch is not fully merged)
                      </label>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleDelete}
                        disabled={!branch.merged && !forceDelete}
                      >
                        Delete
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          Select a branch to view details
        </div>
      )}

      {/* Action feedback */}
      {actionMessage && (
        <div
          className={`rounded px-3 py-2 text-sm ${
            actionMessage.success
              ? 'bg-green-500/10 text-green-400'
              : 'bg-red-500/10 text-red-400'
          }`}
        >
          {actionMessage.text}
        </div>
      )}

      <Separator />

      {/* Create new branch */}
      <div>
        <h4 className="mb-2 text-sm font-medium">Create New Branch</h4>
        <div className="flex gap-2">
          <Input
            placeholder="branch-name"
            value={newBranchName}
            onChange={(e) => setNewBranchName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            className="font-mono text-xs"
          />
          <Button size="sm" onClick={handleCreate} disabled={!newBranchName.trim() || actionLoading}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Create
          </Button>
        </div>
      </div>
    </div>
  );
}
