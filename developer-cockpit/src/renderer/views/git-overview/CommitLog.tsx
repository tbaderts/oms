import React from 'react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { GitLogEntry } from '@shared/types/git';

interface CommitLogProps {
  log: GitLogEntry[];
  selectedHash: string | null;
  onSelect: (entry: GitLogEntry) => void;
}

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function CommitLog({ log, selectedHash, onSelect }: CommitLogProps) {
  return (
    <ScrollArea className="h-full">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Hash</TableHead>
            <TableHead>Message</TableHead>
            <TableHead className="w-28">Author</TableHead>
            <TableHead className="w-24 text-right">Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {log.map((entry) => (
            <TableRow
              key={entry.hash}
              className={`cursor-pointer ${selectedHash === entry.hash ? 'bg-muted' : ''}`}
              onClick={() => onSelect(entry)}
            >
              <TableCell className="font-mono text-xs text-muted-foreground">
                {entry.hash.substring(0, 7)}
              </TableCell>
              <TableCell className="max-w-md truncate text-sm">{entry.message}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{entry.author}</TableCell>
              <TableCell className="text-right text-xs text-muted-foreground">
                {formatRelativeDate(entry.date)}
              </TableCell>
            </TableRow>
          ))}
          {log.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No commits found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}
