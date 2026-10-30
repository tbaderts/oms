// Advisory validation of a loaded storyboard (source-spec §7.3). Problems are data for the reader
// and the content check; nothing here stops a storyboard from opening.
import {
  LINK_CATEGORIES,
  PROBLEM_SEVERITY,
  type DataIn,
  type DataOut,
  type LinkIndex,
  type Problem,
  type ProblemCode,
  type Step,
  type StoryboardDetail,
} from '../types/storyboards';

type Input = Pick<StoryboardDetail, 'lanes' | 'steps' | 'orphanSteps'>;

export function validate(story: Input, index: LinkIndex): Problem[] {
  const problems: Problem[] = [];
  const add = (code: ProblemCode, message: string, stepId?: string, extensionId?: string, subject?: string) =>
    problems.push({ code, severity: PROBLEM_SEVERITY[code], message, ...(stepId && { stepId }), ...(extensionId && { extensionId }), ...(subject && { subject }) });

  const laneIds = new Set(story.lanes.map((l) => l.id));
  const stepIndex = new Map(story.steps.map((s) => [s.id, s.index]));
  const linkSets = Object.fromEntries(LINK_CATEGORIES.map((c) => [c, new Set(index[c])])) as Record<keyof LinkIndex, Set<string>>;

  for (const step of story.steps) {
    if (!step.readable) {
      add('step-unreadable', `Step "${step.id}" cannot be read: ${step.unreadableReason ?? 'unknown reason'}.`, step.id);
      continue;
    }

    for (const end of ['from', 'to'] as const) {
      const lane = step[end];
      if (lane !== undefined && !laneIds.has(lane)) add('unknown-lane', `"${end}: ${lane}" is not a declared lane.`, step.id);
    }

    for (const ill of step.illustrations) {
      if (ill.missing) add('missing-illustration', `Illustration "${ill.src}" is missing.`, step.id);
    }

    for (const category of LINK_CATEGORIES) {
      if (linkSets[category].size === 0) continue;
      for (const target of step.links[category]) {
        if (!linkSets[category].has(target)) add('unresolved-link', `${category} link "${target}" does not resolve.`, step.id);
      }
    }

    checkInputs(step.in, step, false, undefined);

    const seen = new Set<string>();
    const reported = new Set<string>();
    for (const ext of step.extensions) {
      if (seen.has(ext.id)) {
        if (!reported.has(ext.id)) add('extension-duplicate-id', `Extension id "${ext.id}" is used more than once.`, step.id, ext.id);
        reported.add(ext.id);
      }
      seen.add(ext.id);

      if (ext.continueAt.kind === 'step') {
        const target = stepIndex.get(ext.continueAt.step);
        if (target === undefined) {
          add('extension-unknown-target', `Extension "${ext.id}" continues at undeclared step "${ext.continueAt.step}".`, step.id, ext.id);
        } else if (target <= step.index) {
          add('extension-backward-target', `Extension "${ext.id}" jumps back to "${ext.continueAt.step}"; only later steps are allowed.`, step.id, ext.id);
        }
      }

      for (const ill of ext.illustrations) {
        if (ill.missing) add('missing-illustration', `Illustration "${ill.src}" of extension "${ext.id}" is missing.`, step.id, ext.id);
      }
      checkInputs(ext.in, step, true, ext.id);
    }
  }

  for (const orphan of story.orphanSteps) {
    add('orphan-step', `steps/${orphan}.md is not listed in story.md.`, orphan);
  }

  checkUnreadOutputs();
  return problems;

  function checkInputs(inputs: DataIn[], owner: Step, inExtension: boolean, extensionId: string | undefined) {
    // An extension runs after its own step, so it may read that step's outputs; a step may not.
    const isEarlier = (i: number) => (inExtension ? i <= owner.index : i < owner.index);
    for (const input of inputs) {
      const origin = input.origin;
      if (origin.kind === 'unknown') {
        add('data-no-source', `Input "${input.name}" has no known source.`, owner.id, extensionId, input.name);
      } else if (origin.kind === 'step') {
        const i = stepIndex.get(origin.ref);
        if (i === undefined || !isEarlier(i)) {
          add('data-origin-unresolved', `Input "${input.name}" claims step "${origin.ref}", which is not an earlier step.`, owner.id, extensionId, input.name);
        }
      } else if (origin.kind === 'extension') {
        const [stepRef, extRef] = origin.ref.split('/');
        const source = story.steps.find((s) => s.id === stepRef);
        const valid = source && isEarlier(source.index) && source.extensions.some((e) => e.id === extRef) && !(source.id === owner.id && extRef === extensionId);
        if (!valid) {
          add('data-origin-unresolved', `Input "${input.name}" claims extension "${origin.ref}", which is not an earlier alternate path.`, owner.id, extensionId, input.name);
        }
      } else if ('lane' in origin && !laneIds.has(origin.lane)) {
        add('data-origin-unresolved', `Input "${input.name}" claims lane "${origin.lane}", which is not declared.`, owner.id, extensionId, input.name);
      }
    }
  }

  function checkUnreadOutputs() {
    // Names read by each step position and later: inputs of the step and of its extensions.
    const readAt = story.steps.map((s) => [...s.in, ...s.extensions.flatMap((e) => e.in)].map((d) => d.name.toLowerCase()));
    const readAfter = (i: number) => new Set(readAt.slice(i + 1).flat());
    const unread = (outs: DataOut[], i: number) => outs.filter((o) => !o.final && !readAfter(i).has(o.name.toLowerCase()));
    for (const step of story.steps) {
      if (!step.readable) continue;
      for (const o of unread(step.out, step.index)) {
        add('data-never-read', `Output "${o.name}" is not read by a later step; mark it final if it leaves the journey.`, step.id, undefined, o.name);
      }
      for (const ext of step.extensions) {
        for (const o of unread(ext.out, step.index)) {
          add('data-never-read', `Output "${o.name}" of extension "${ext.id}" is not read later; mark it final if it leaves the journey.`, step.id, ext.id, o.name);
        }
      }
    }
  }
}
