import React from 'react';
import { Button } from '@/components/ui/button';
import { useConflictStore } from './useStoryboardEdits';

/** Shown when a save was based on an older revision: nothing was written until the user chooses. */
export function ConflictDialog() {
  const pending = useConflictStore((s) => s.pending);
  if (!pending) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="presentation">
      <div role="alertdialog" aria-modal="true" aria-labelledby="sb-conflict-title" className="w-[28rem] rounded-lg border border-border bg-background p-4 shadow-lg">
        <h2 id="sb-conflict-title" className="text-base font-semibold">The file changed on disk</h2>
        <p className="mt-2 text-sm text-muted-foreground">{pending.message} Your edit was not saved.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={pending.reload}>Reload</Button>
          <Button variant="destructive" onClick={() => pending.overwrite(pending.latestRevision)}>Overwrite</Button>
        </div>
      </div>
    </div>
  );
}
