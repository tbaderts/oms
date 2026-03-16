import React, { useEffect, useMemo } from 'react';
import { useSpecsStore } from '@/stores/specs';
import { TaskCard } from './TaskCard';
import { OutputConsole } from './OutputConsole';
import { Button } from '@/components/ui/button';
import { Play, Loader2 } from 'lucide-react';

export function CodeGeneratorView() {
  const {
    codeGenTasks,
    codeGenResults,
    runningTask,
    loadCodeGenTasks,
    runCodeGen,
    runAllCodeGen,
  } = useSpecsStore();

  useEffect(() => {
    loadCodeGenTasks();
  }, [loadCodeGenTasks]);

  const latestOutput = useMemo(() => {
    const results = Array.from(codeGenResults.values());
    if (results.length === 0) return '';
    return results[results.length - 1].output;
  }, [codeGenResults]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-6 py-3">
        <h2 className="text-lg font-medium">Code Generator</h2>
        <div className="flex-1" />
        <Button onClick={runAllCodeGen} disabled={!!runningTask}>
          {runningTask ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Play className="mr-2 h-4 w-4" />
          )}
          Run All
        </Button>
      </div>

      {/* Task cards */}
      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {codeGenTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              result={codeGenResults.get(task.id)}
              running={runningTask === task.id}
              onRun={() => runCodeGen(task.id)}
            />
          ))}
        </div>
      </div>

      {/* Output console */}
      <OutputConsole output={latestOutput} />
    </div>
  );
}
