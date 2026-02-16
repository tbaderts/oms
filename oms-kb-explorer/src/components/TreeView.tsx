import { useQuery } from '@tanstack/react-query';
import { FileText, Folder, FolderOpen, Star, CheckCircle2 } from 'lucide-react';
import { kbApi } from '../services/api';
import type { DocMeta } from '../types';

interface TreeViewProps {
  onSelectDoc: (path: string) => void;
  selectedDoc: string | null;
}

export default function TreeView({ onSelectDoc, selectedDoc }: TreeViewProps) {
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

  // Group documents by folder
  const folders = documents.reduce((acc, doc) => {
    const folder = doc.path.split('/')[1] || 'root';
    if (!acc[folder]) acc[folder] = [];
    acc[folder].push(doc);
    return acc;
  }, {} as Record<string, DocMeta[]>);

  return (
    <div className="p-2">
      <div className="px-2 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        Documents
      </div>
      {Object.entries(folders).map(([folderName, docs]) => (
        <div key={folderName} className="mt-2">
          <div className="flex items-center px-2 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
            <Folder className="w-4 h-4 mr-2 text-blue-500" />
            {folderName}
          </div>
          <div className="ml-2 space-y-0.5">
            {docs.map((doc) => (
              <button
                key={doc.path}
                onClick={() => onSelectDoc(doc.path)}
                className={`w-full flex items-center px-2 py-1.5 text-sm rounded-md transition-colors ${
                  selectedDoc === doc.path
                    ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <FileText className="w-4 h-4 mr-2 flex-shrink-0" />
                <span className="flex-1 text-left truncate">{doc.name}</span>
                {doc.status === 'Complete' && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
