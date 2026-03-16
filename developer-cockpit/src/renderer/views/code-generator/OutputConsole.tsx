import React, { useEffect, useRef } from 'react';

interface OutputConsoleProps {
  output: string;
}

export function OutputConsole({ output }: OutputConsoleProps) {
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [output]);

  return (
    <div className="flex flex-col border-t border-border">
      <div className="border-b border-border px-4 py-1.5">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Output</span>
      </div>
      <pre
        ref={preRef}
        className="h-64 overflow-auto bg-zinc-950 p-4 font-mono text-xs text-zinc-300"
      >
        {output || 'No output yet. Run a code generation task to see results.'}
      </pre>
    </div>
  );
}
