import React from 'react';
import { GitBranch, AlertTriangle, ArrowUp, ArrowDown, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { GitStatus } from '@shared/types/git';

interface StatusPanelProps {
  status: GitStatus | null;
  onRefresh: () => void;
  loading: boolean;
}

export function StatusPanel({ status, onRefresh, loading }: StatusPanelProps) {
  if (!status) return null;

  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-muted-foreground" />
          <span className="font-mono text-sm font-medium">{status.branch}</span>
        </div>

        {status.detached && (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            Detached HEAD
          </Badge>
        )}

        <Badge variant={status.clean ? 'secondary' : 'destructive'}>
          {status.clean ? 'Clean' : 'Dirty'}
        </Badge>

        {status.tracking && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-0.5">
              <ArrowUp className="h-3 w-3" />
              {status.ahead}
            </span>
            <span className="flex items-center gap-0.5">
              <ArrowDown className="h-3 w-3" />
              {status.behind}
            </span>
          </div>
        )}

        <div className="ml-auto">
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
