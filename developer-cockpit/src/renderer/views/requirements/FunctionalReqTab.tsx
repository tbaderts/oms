import React from 'react';
import { useRequirementsStore } from '@/stores/requirements';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

const PRIORITY_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  must: 'destructive',
  should: 'default',
  could: 'secondary',
  wont: 'outline',
};

export function FunctionalReqTab() {
  const functionalReqs = useRequirementsStore((s) => s.functionalReqs);

  if (functionalReqs.length === 0) {
    return <p className="py-8 text-center text-muted-foreground">No functional requirements found in the knowledge base.</p>;
  }

  return (
    <div className="mt-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">ID</TableHead>
            <TableHead>Title</TableHead>
            <TableHead className="w-24">Priority</TableHead>
            <TableHead className="w-28">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {functionalReqs.map((fr) => (
            <TableRow key={fr.id}>
              <TableCell className="font-mono text-xs">{fr.id}</TableCell>
              <TableCell>
                <div className="font-medium">{fr.title}</div>
                <div className="text-xs text-muted-foreground line-clamp-2">{fr.description}</div>
              </TableCell>
              <TableCell>
                <Badge variant={PRIORITY_COLORS[fr.priority] || 'secondary'}>
                  {fr.priority.toUpperCase()}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{fr.status}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
