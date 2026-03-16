import React from 'react';
import type { SpecFile } from '@shared/types/specs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, Database } from 'lucide-react';

interface SpecFileTreeProps {
  files: SpecFile[];
  selectedFile: SpecFile | null;
  dirty: boolean;
  onSelect: (file: SpecFile) => void;
}

export function SpecFileTree({ files, selectedFile, dirty, onSelect }: SpecFileTreeProps) {
  const openApiFiles = files.filter((f) => f.type === 'openapi');
  const avroFiles = files.filter((f) => f.type === 'avro');

  return (
    <div className="flex w-64 flex-col border-r border-border">
      <div className="border-b border-border px-3 py-2">
        <h3 className="text-sm font-medium text-foreground">Spec Files</h3>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2">
          {openApiFiles.length > 0 && (
            <FileGroup
              label="OpenAPI"
              icon={<FileText className="h-3.5 w-3.5" />}
              files={openApiFiles}
              selectedFile={selectedFile}
              dirty={dirty}
              onSelect={onSelect}
            />
          )}
          {avroFiles.length > 0 && (
            <FileGroup
              label="Avro"
              icon={<Database className="h-3.5 w-3.5" />}
              files={avroFiles}
              selectedFile={selectedFile}
              dirty={dirty}
              onSelect={onSelect}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function FileGroup({
  label,
  icon,
  files,
  selectedFile,
  dirty,
  onSelect,
}: {
  label: string;
  icon: React.ReactNode;
  files: SpecFile[];
  selectedFile: SpecFile | null;
  dirty: boolean;
  onSelect: (file: SpecFile) => void;
}) {
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center gap-1.5 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
        <span className="ml-auto text-xs font-normal">{files.length}</span>
      </div>
      {files.map((file) => {
        const isSelected = selectedFile?.path === file.path;
        return (
          <button
            key={file.path}
            onClick={() => onSelect(file)}
            className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm transition-colors ${
              isSelected
                ? 'bg-accent text-accent-foreground'
                : 'text-foreground hover:bg-accent/50'
            }`}
          >
            <span className="truncate">{file.name}</span>
            {isSelected && dirty && (
              <span className="ml-auto h-2 w-2 flex-shrink-0 rounded-full bg-orange-400" title="Unsaved changes" />
            )}
          </button>
        );
      })}
    </div>
  );
}
