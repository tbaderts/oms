import React, { useEffect } from 'react';
import { useSpecsStore } from '@/stores/specs';
import { SpecFileTree } from './SpecFileTree';
import { SpecEditor } from './SpecEditor';
import { LoadingSpinner } from '@/components/LoadingSpinner';

export function SpecsEditorView() {
  const {
    files,
    selectedFile,
    fileContent,
    dirty,
    validation,
    loading,
    discoverFiles,
    selectFile,
    updateContent,
    saveFile,
  } = useSpecsStore();

  useEffect(() => {
    discoverFiles();
  }, [discoverFiles]);

  return (
    <div className="flex h-full">
      <SpecFileTree
        files={files}
        selectedFile={selectedFile}
        dirty={dirty}
        onSelect={selectFile}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        {loading ? (
          <LoadingSpinner />
        ) : selectedFile ? (
          <SpecEditor
            file={selectedFile}
            content={fileContent}
            dirty={dirty}
            validation={validation}
            onContentChange={updateContent}
            onSave={saveFile}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <p>Select a spec file to edit</p>
          </div>
        )}
      </div>
    </div>
  );
}
