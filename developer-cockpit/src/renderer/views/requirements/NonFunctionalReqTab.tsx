import React from 'react';
import { useRequirementsStore } from '@/stores/requirements';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

export function NonFunctionalReqTab() {
  const nonFunctionalReqs = useRequirementsStore((s) => s.nonFunctionalReqs);

  if (nonFunctionalReqs.length === 0) {
    return <p className="py-8 text-center text-muted-foreground">No non-functional requirements found in the knowledge base.</p>;
  }

  return (
    <div className="mt-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">ID</TableHead>
            <TableHead>Title</TableHead>
            <TableHead className="w-28">Category</TableHead>
            <TableHead>Metric</TableHead>
            <TableHead>Target</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {nonFunctionalReqs.map((nfr) => (
            <TableRow key={nfr.id}>
              <TableCell className="font-mono text-xs">{nfr.id}</TableCell>
              <TableCell>
                <div className="font-medium">{nfr.title}</div>
                <div className="text-xs text-muted-foreground line-clamp-2">{nfr.description}</div>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{nfr.category}</Badge>
              </TableCell>
              <TableCell className="text-sm">{nfr.metric || '-'}</TableCell>
              <TableCell className="text-sm">{nfr.target || '-'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
