import React from 'react';
import type { SpecActionResult } from '@shared/types/specTickets';
import { cn } from '@/lib/utils';

/** The CLI's own output: exit 0 ok, 3 awaiting approval, anything else rejected. */
export function ActionOutput({ result }: { result: SpecActionResult }) {
  const tone = result.exitCode === 0 ? 'ok' : result.exitCode === 3 ? 'awaiting' : 'error';
  const output = [result.stdout, result.stderr].filter((s) => s.trim()).join('\n');
  return (
    <div
      role="status"
      className={cn(
        'rounded-md border p-3 text-xs',
        tone === 'ok' && 'border-primary/30',
        tone === 'awaiting' && 'border-amber-500/50 bg-amber-500/10',
        tone === 'error' && 'border-destructive/50 bg-destructive/10',
      )}
    >
      <div className="mb-1 font-semibold">
        exit {result.exitCode}
        {tone === 'awaiting' && ' (awaiting approval)'}
      </div>
      {output && <pre className="whitespace-pre-wrap font-mono">{output}</pre>}
    </div>
  );
}
