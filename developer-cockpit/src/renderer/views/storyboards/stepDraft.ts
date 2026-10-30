// The step editor's draft model, kept free of React so the save path can be tested end to end.
import type { DataIn, DataOut, Step, StepKind, StepLinks, StepPatch, StoredExtension, StoredIllustration } from '@shared/types/storyboards';

export interface StepDraft {
  title: string;
  kind: StepKind;
  from: string;
  to: string;
  illustrations: StoredIllustration[];
  links: StepLinks;
  in: DataIn[];
  out: DataOut[];
  extensions: StoredExtension[];
  body: string;
}

export const draftKey = (storyId: string, stepId: string) => `storyboard-draft:${storyId}:${stepId}`;

export function draftOf(step: Step): StepDraft {
  return {
    title: step.title,
    kind: step.kind,
    from: step.from ?? '',
    to: step.to ?? '',
    illustrations: step.illustrations.map((i) => ({ src: i.src, ...(i.caption && { caption: i.caption }) })),
    links: { ...step.links },
    in: step.in.map((i) => ({ ...i })),
    out: step.out.map((o) => ({ ...o })),
    extensions: step.extensions.map((e) => ({
      id: e.id, when: e.when, then: e.then, continueAt: e.continueAt,
      illustrations: e.illustrations.map((i) => ({ src: i.src, ...(i.caption && { caption: i.caption }) })),
      in: e.in, out: e.out,
    })),
    body: step.body,
  };
}

/**
 * Only the keys whose value differs from the step as loaded, so that a save rewrites nothing the
 * user did not touch (every edit stays a small, reviewable diff).
 */
export function patchFromDraft(step: Step, draft: StepDraft): { patch: StepPatch; body: string } {
  const base = draftOf(step);
  const patch: Record<string, unknown> = {};
  const changed = (key: keyof StepDraft) => JSON.stringify(base[key]) !== JSON.stringify(draft[key]);
  if (draft.title.trim() !== base.title) patch.title = draft.title.trim();
  if (changed('kind')) patch.kind = draft.kind;
  for (const end of ['from', 'to'] as const) if (changed(end)) patch[end] = draft[end] || null;
  if (changed('links')) {
    // Empty categories are not written; they mean the same as an absent one.
    patch.links = Object.fromEntries(Object.entries(draft.links).filter(([, values]) => values.length > 0));
  }
  for (const key of ['illustrations', 'in', 'out', 'extensions'] as const) if (changed(key)) patch[key] = draft[key];
  return { patch: patch as StepPatch, body: draft.body };
}
