import React, { useState, useEffect } from 'react';
import { FileTree } from './FileTree';
import { FilePreview } from './FilePreview';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useConfigStore } from '@/stores/config';

export function FileExplorerView() {
  const workspaceRoot = useConfigStore((s) => s.config.general.workspaceRoot);
  const [selectedFile, setSelectedFile] = useState<{ path: string; content: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFileSelect = async (path: string) => {
    setLoading(true);
    try {
      const content = await window.cockpit.fs.readFile(path);
      setSelectedFile({ path, content });
    } catch (err) {
      setSelectedFile({ path, content: `Error reading file: ${err}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full">
      {/* Left panel - File tree */}
      <div className="w-72 border-r border-border">
        <div className="border-b border-border px-3 py-2">
          <h2 className="text-sm font-medium truncate" title={workspaceRoot}>
            {workspaceRoot.split(/[/\\]/).pop() || workspaceRoot}
          </h2>
        </div>
        <ScrollArea className="h-[calc(100%-36px)]">
          <div className="p-1">
            <FileTree rootPath={workspaceRoot} onFileSelect={handleFileSelect} />
          </div>
        </ScrollArea>
      </div>

      {/* Right panel - File preview */}
      <div className="flex-1 overflow-hidden">
        {selectedFile ? (
          <FilePreview path={selectedFile.path} content={selectedFile.content} loading={loading} />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <p>Select a file to preview</p>
          </div>
        )}
      </div>
    </div>
  );
}
