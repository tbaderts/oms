import React from 'react';
import type { CodeGenTask, CodeGenResult } from '@shared/types/specs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Loader2, CheckCircle, XCircle } from 'lucide-react';

interface TaskCardProps {
  task: CodeGenTask;
  result?: CodeGenResult;
  running: boolean;
  onRun: () => void;
}

export function TaskCard({ task, result, running, onRun }: TaskCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{task.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">{task.description}</p>
        <div className="text-xs text-muted-foreground">
          <span className="font-medium">{task.inputSpec}</span>
          <span className="mx-1">&rarr;</span>
          <span className="font-medium">{task.outputPackage}</span>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" onClick={onRun} disabled={running}>
            {running ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="mr-1 h-3.5 w-3.5" />
            )}
            Run
          </Button>
          {result && (
            result.success ? (
              <Badge variant="outline" className="text-green-500 border-green-500">
                <CheckCircle className="mr-1 h-3 w-3" />
                {(result.durationMs / 1000).toFixed(1)}s
              </Badge>
            ) : (
              <Badge variant="outline" className="text-red-500 border-red-500">
                <XCircle className="mr-1 h-3 w-3" />
                Failed
              </Badge>
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
}
