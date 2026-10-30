import { useCallback, useState } from 'react';
import { create } from 'zustand';
import type { Problem, StepPatch, StoryboardDetail, StoryboardResult } from '@shared/types/storyboards';
import { useStoryboardsStore } from '@/stores/storyboards';
import type { QuickFix } from './Panels';

type SaveResult = StoryboardResult<{ revision: string; changed: boolean }>;

/** A stale save waiting for the user: Reload (take the disk version) or Overwrite (resend on top of it). */
interface PendingConflict {
  message: string;
  latestRevision: string;
  overwrite: (latestRevision: string) => Promise<void>;
  reload: () => void;
}

export const useConflictStore = create<{ pending: PendingConflict | null; set: (p: PendingConflict | null) => void }>((set) => ({
  pending: null,
  set: (pending) => set({ pending }),
}));

/**
 * Saves a step through the normal revision path. A conflict opens the conflict dialog; `onSaved`
 * runs after a successful write (or an intentional overwrite), `onReload` when the user reloads.
 */
export async function saveStepGuarded(
  d: StoryboardDetail,
  stepId: string,
  patch: StepPatch,
  body: string,
  revision: string,
  hooks: { onSaved?: () => void; onReload?: () => void } = {},
): Promise<SaveResult> {
  const api = window.cockpit.storyboards;
  const r = await api.saveStep(d.id, stepId, patch, body, revision);
  if (r.ok) {
    hooks.onSaved?.();
    await useStoryboardsStore.getState().refresh();
  } else if (r.code === 'conflict') {
    useConflictStore.getState().set({
      message: `"${d.steps.find((s) => s.id === stepId)?.title ?? stepId}" changed on disk since you opened it.`,
      latestRevision: r.latestRevision,
      overwrite: async (latest) => {
        useConflictStore.getState().set(null);
        await saveStepGuarded(d, stepId, patch, body, latest, hooks);
      },
      reload: () => {
        useConflictStore.getState().set(null);
        hooks.onReload?.();
        void useStoryboardsStore.getState().refresh();
      },
    });
  }
  return r;
}

/** Safe quick fixes, only for a normal step's own data (never for an alternate path's). */
export function useQuickFixes(d: StoryboardDetail): (p: Problem) => QuickFix | null {
  return useCallback(
    (p: Problem) => {
      if (p.extensionId || !p.stepId || !p.subject) return null;
      const step = d.steps.find((s) => s.id === p.stepId && s.readable);
      if (!step) return null;
      if (p.code === 'data-no-source') {
        return {
          label: 'Mark as external',
          apply: () => {
            const inputs = step.in.map((i) => (i.name === p.subject && i.origin.kind === 'unknown' ? { ...i, origin: { kind: 'external' as const, label: 'unspecified' } } : i));
            void saveStepGuarded(d, step.id, { in: inputs }, step.body, step.revision);
          },
        };
      }
      if (p.code === 'data-never-read') {
        return {
          label: 'Mark as final',
          apply: () => {
            const outputs = step.out.map((o) => (o.name === p.subject ? { ...o, final: true } : o));
            void saveStepGuarded(d, step.id, { out: outputs }, step.body, step.revision);
          },
        };
      }
      return null;
    },
    [d],
  );
}

/** Reorder and insert from the strip; both change story.md only (step files keep their names). */
export function useStructureEdits(d: StoryboardDetail) {
  const [message, setMessage] = useState<string | null>(null);
  const after = async (r: StoryboardResult) => {
    if (!r.ok) setMessage(r.code === 'conflict' ? 'story.md changed on disk; the storyboard was reloaded. Please try again.' : r.message);
    else setMessage(null);
    await useStoryboardsStore.getState().refresh();
  };
  const reorder = useCallback(async (stepIds: string[]) => after(await window.cockpit.storyboards.reorder(d.id, stepIds, d.revision)), [d]);
  const insertAfter = useCallback(
    async (afterStepId: string | null) => {
      const r = await window.cockpit.storyboards.createStep(d.id, 'New step', afterStepId, d.revision);
      await after(r);
      if (r.ok) {
        useStoryboardsStore.getState().selectStep(r.stepId);
        useStoryboardsStore.getState().setEditing({ kind: 'step', stepId: r.stepId });
      }
    },
    [d],
  );
  return { reorder, insertAfter, message };
}
