import { useQuery } from '@tanstack/react-query';
import { List } from 'lucide-react';
import { kbApi } from '../services/api';

interface TableOfContentsProps {
  documentPath: string;
}

export default function TableOfContents({ documentPath }: TableOfContentsProps) {
  const { data: sections, isLoading } = useQuery({
    queryKey: ['sections', documentPath],
    queryFn: () => kbApi.listSections(documentPath),
  });

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-6 bg-gray-200 dark:bg-gray-700 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (!sections || sections.length === 0) {
    return null;
  }

  return (
    <div className="p-4">
      <div className="flex items-center space-x-2 mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
        <List className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
          On This Page
        </h3>
      </div>
      <nav className="space-y-1">
        {sections.map((section, index) => (
          <a
            key={index}
            href={`#${section.title.toLowerCase().replace(/\s+/g, '-')}`}
            className={`block py-1 text-sm transition-colors hover:text-blue-600 dark:hover:text-blue-400 ${
              section.level === 2
                ? 'text-gray-700 dark:text-gray-300 font-medium'
                : 'text-gray-600 dark:text-gray-400 pl-4'
            }`}
            style={{ paddingLeft: `${(section.level - 2) * 1}rem` }}
          >
            {section.title}
          </a>
        ))}
      </nav>
    </div>
  );
}
