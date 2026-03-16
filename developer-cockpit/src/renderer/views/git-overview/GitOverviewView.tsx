import React, { useEffect, useCallback, useRef } from 'react';
import { useGitStore } from '@/stores/git';
import { useEventBus } from '@/hooks/useEventBus';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { StatusPanel } from './StatusPanel';
import { CommitLog } from './CommitLog';
import { ChangedFiles } from './ChangedFiles';
import { DiffViewer } from './DiffViewer';

export function GitOverviewView() {
  const {
    status,
    log,
    selectedCommit,
    selectedFile,
    currentDiff,
    fileDiff,
    loading,
    refreshAll,
    refreshStatus,
    refreshLog,
    selectCommit,
    selectFile,
  } = useGitStore();

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const handleFileChange = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      refreshStatus();
      refreshLog();
    }, 500);
  }, [refreshStatus, refreshLog]);

  useEventBus('file:changed', handleFileChange);

  const handleRefresh = useCallback(() => {
    refreshAll();
  }, [refreshAll]);

  const diffContent = selectedCommit ? currentDiff?.raw ?? null : fileDiff;
  const diffContext = selectedCommit
    ? { commit: selectedCommit }
    : selectedFile
      ? { filePath: selectedFile }
      : undefined;

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <StatusPanel status={status} onRefresh={handleRefresh} loading={loading} />

      <div className="flex min-h-0 flex-1 gap-3">
        {/* Left panel: Commits / Changed Files tabs */}
        <div className="flex w-1/2 flex-col">
          <Tabs defaultValue="commits" className="flex flex-1 flex-col">
            <TabsList>
              <TabsTrigger value="commits">Commits</TabsTrigger>
              <TabsTrigger value="changed">Changed Files</TabsTrigger>
            </TabsList>
            <TabsContent value="commits" className="flex-1 overflow-hidden">
              <CommitLog
                log={log}
                selectedHash={selectedCommit?.hash ?? null}
                onSelect={selectCommit}
              />
            </TabsContent>
            <TabsContent value="changed" className="flex-1 overflow-hidden">
              {status && (
                <ChangedFiles
                  status={status}
                  selectedPath={selectedFile}
                  onSelect={selectFile}
                />
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Right panel: Diff viewer */}
        <div className="flex-1 overflow-hidden">
          <DiffViewer diff={diffContent} context={diffContext} />
        </div>
      </div>
    </div>
  );
}
