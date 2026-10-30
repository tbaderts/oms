import React, { Suspense, lazy, useCallback, useEffect } from 'react';
import { useStoryboardsStore } from '@/stores/storyboards';
import { useEventBus } from '@/hooks/useEventBus';
import { StoryboardBrowser } from './StoryboardBrowser';
import { JourneyPane } from './JourneyPane';
import { PresentationMode } from './PresentationMode';

const NewStoryWizard = lazy(() => import('./NewStoryWizard').then((m) => ({ default: m.NewStoryWizard })));

/** True when a key press belongs to a text field or an editor, not to journey navigation. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], .monaco-editor, .excalidraw')) return true;
  return false;
}

/** Storyboards (SPEC-0014): catalogue on the left, the selected journey on the right. */
export function StoryboardsView() {
  const refresh = useStoryboardsStore((s) => s.refresh);
  const editing = useStoryboardsStore((s) => s.editing);
  const presenting = useStoryboardsStore((s) => s.presenting);
  const hasDetail = useStoryboardsStore((s) => !!s.detail);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // A change on disk can add or remove whole storyboards: always rescan, never patch.
  const onChanged = useCallback(() => {
    useStoryboardsStore.getState().refresh();
  }, []);
  useEventBus('storyboards:changed', onChanged);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStoryboardsStore.getState();
      if (!s.detail || s.presenting || s.editing || e.altKey || e.ctrlKey || e.metaKey || isTypingTarget(e.target)) return;
      const keys: Record<string, () => void> = {
        ArrowRight: () => s.moveSelection('next'),
        j: () => s.moveSelection('next'),
        ArrowLeft: () => s.moveSelection('prev'),
        k: () => s.moveSelection('prev'),
        Home: () => s.moveSelection('first'),
        End: () => s.moveSelection('last'),
        Escape: () => s.selectStep(null),
        e: () => {
          if (s.scan?.writable && s.selectedStepId) s.setEditing({ kind: 'step', stepId: s.selectedStepId });
        },
        p: () => s.setPresenting(true),
        d: () => s.toggleLayer('data'),
        a: () => s.toggleLayer('extensions'),
      };
      const action = keys[e.key];
      if (!action) return;
      e.preventDefault();
      action();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-full">
      <StoryboardBrowser />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden" aria-label="Storyboard">
        {editing?.kind === 'new' ? (
          <Suspense fallback={null}>
            <NewStoryWizard />
          </Suspense>
        ) : hasDetail ? (
          <JourneyPane />
        ) : (
          <EmptyState />
        )}
      </main>
      {presenting && hasDetail && <PresentationMode />}
    </div>
  );
}

function EmptyState() {
  const error = useStoryboardsStore((s) => s.detailError);
  const selectedId = useStoryboardsStore((s) => s.selectedId);
  return (
    <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
      {error ? `This storyboard cannot be opened: ${error}` : selectedId ? 'Loading…' : 'Pick a storyboard to see how the process runs.'}
    </div>
  );
}
