import { describe, expect, it } from 'vitest';
import { validate } from '../../src/shared/storyboards/validate';
import type { LinkIndex, ProblemCode } from '../../src/shared/types/storyboards';
import { ext, illustration, step, story } from './storyboardFactories';

const index: LinkIndex = {
  api: ['oms-cmd-api#executeCommand', 'oms-cmd-api#OrderCreateCmd'],
  events: ['OrderMessage'],
  states: ['NEW -> UNACK'],
  requirements: ['FR-001'],
};

const codes = (problems: { code: ProblemCode }[]) => problems.map((p) => p.code);

describe('validate', () => {
  it('a clean story has no problems', () => {
    const s = story([
      step('request-quote', 0, { from: 'customer', to: 'app', out: [{ name: 'Quote' }] }),
      step('accept-quote', 1, {
        from: 'customer', to: 'app',
        in: [{ name: 'quote', origin: { kind: 'step', ref: 'request-quote' } }],
        out: [{ name: 'Receipt', final: true }],
        links: { api: ['oms-cmd-api#OrderCreateCmd'], events: ['OrderMessage'], states: ['NEW -> UNACK'], requirements: ['FR-001'] },
      }),
    ]);
    expect(validate(s, index)).toEqual([]);
  });

  it('step-unreadable is an error', () => {
    const problems = validate(story([step('a', 0, { readable: false, unreadableReason: 'file is missing' })]), index);
    expect(problems).toEqual([expect.objectContaining({ code: 'step-unreadable', severity: 'error', stepId: 'a' })]);
    expect(problems[0].message).toContain('file is missing');
  });

  it('unknown-lane is an error, once per bad end', () => {
    const problems = validate(story([step('a', 0, { from: 'nobody', to: 'nowhere' })]), index);
    expect(codes(problems)).toEqual(['unknown-lane', 'unknown-lane']);
    expect(problems.every((p) => p.severity === 'error')).toBe(true);
  });

  it('missing-illustration is a warning, for steps and extensions', () => {
    const problems = validate(story([
      step('a', 0, {
        illustrations: [illustration('a.excalidraw.svg', true), illustration('ok.png')],
        extensions: [ext('fails', { illustrations: [illustration('f.svg', true)] })],
      }),
    ]), index);
    expect(codes(problems)).toEqual(['missing-illustration', 'missing-illustration']);
    expect(problems[1]).toMatchObject({ severity: 'warning', extensionId: 'fails' });
  });

  it('unresolved-link is a warning only when the category index is non-empty', () => {
    const s = story([step('a', 0, { links: { api: ['oms-cmd-api#nope'], events: ['Nope'], states: [], requirements: ['FR-999'] } })]);
    expect(codes(validate(s, index))).toEqual(['unresolved-link', 'unresolved-link', 'unresolved-link']);
    expect(codes(validate(s, { ...index, events: [], requirements: [] }))).toEqual(['unresolved-link']);
    expect(validate(s, index)[0].severity).toBe('warning');
  });

  it('orphan-step is a warning', () => {
    const problems = validate(story([step('a', 0)], { orphanSteps: ['forgotten'] }), index);
    expect(problems).toEqual([expect.objectContaining({ code: 'orphan-step', severity: 'warning', stepId: 'forgotten' })]);
  });

  it('data-no-source is a warning', () => {
    const problems = validate(story([step('a', 0, { in: [{ name: 'Order', origin: { kind: 'unknown' } }] })]), index);
    expect(problems).toEqual([expect.objectContaining({ code: 'data-no-source', severity: 'warning', stepId: 'a' })]);
  });

  it('data-never-read: a non-final output nobody later reads (case-insensitive match counts as read)', () => {
    const s = story([
      step('a', 0, { out: [{ name: 'Order' }, { name: 'Unused' }, { name: 'Leaves', final: true }] }),
      step('b', 1, { in: [{ name: 'ORDER', origin: { kind: 'step', ref: 'a' } }] }),
    ]);
    const problems = validate(s, index);
    expect(problems).toEqual([expect.objectContaining({ code: 'data-never-read', severity: 'warning', stepId: 'a' })]);
    expect(problems[0].message).toContain('Unused');
  });

  it('data-never-read: an extension output read by a later extension does not count as unread', () => {
    const s = story([
      step('a', 0, { extensions: [ext('x', { out: [{ name: 'Alert' }] })] }),
      step('b', 1, { extensions: [ext('y', { in: [{ name: 'alert', origin: { kind: 'extension', ref: 'a/x' } }] })] }),
    ]);
    expect(validate(s, index)).toEqual([]);
  });

  it('data-origin-unresolved: absent, same or later step; unknown extension; undeclared lane', () => {
    const s = story([
      step('a', 0, { out: [{ name: 'X', final: true }] }),
      step('b', 1, {
        in: [
          { name: 'p', origin: { kind: 'step', ref: 'ghost' } },
          { name: 'q', origin: { kind: 'step', ref: 'b' } },
          { name: 'r', origin: { kind: 'step', ref: 'c' } },
          { name: 's', origin: { kind: 'extension', ref: 'a/ghost' } },
          { name: 't', origin: { kind: 'external', lane: 'mars' } },
          { name: 'u', origin: { kind: 'external', lane: 'market' } },
          { name: 'v', origin: { kind: 'external', label: 'Reuters' } },
        ],
      }),
      step('c', 2),
    ]);
    const problems = validate(s, index);
    expect(codes(problems)).toEqual(Array(5).fill('data-origin-unresolved'));
    expect(problems.every((p) => p.severity === 'warning' && p.stepId === 'b')).toBe(true);
  });

  it('extension-unknown-target is an error', () => {
    const problems = validate(story([step('a', 0, { extensions: [ext('x', { continueAt: { kind: 'step', step: 'ghost' } })] })]), index);
    expect(problems).toEqual([expect.objectContaining({ code: 'extension-unknown-target', severity: 'error', stepId: 'a', extensionId: 'x' })]);
  });

  it('extension-backward-target is an error for the owning and earlier steps', () => {
    const s = story([
      step('a', 0),
      step('b', 1, {
        extensions: [
          ext('self', { continueAt: { kind: 'step', step: 'b' } }),
          ext('back', { continueAt: { kind: 'step', step: 'a' } }),
          ext('ahead', { continueAt: { kind: 'step', step: 'c' } }),
          ext('retry', { continueAt: { kind: 'stay' } }),
        ],
      }),
      step('c', 2),
    ]);
    const problems = validate(s, index);
    expect(codes(problems)).toEqual(['extension-backward-target', 'extension-backward-target']);
    expect(problems.map((p) => p.extensionId)).toEqual(['self', 'back']);
    expect(problems[0].severity).toBe('error');
  });

  it('extension-duplicate-id is an error, once per duplicate', () => {
    const problems = validate(story([step('a', 0, { extensions: [ext('x'), ext('x'), ext('y')] })]), index);
    expect(problems).toEqual([expect.objectContaining({ code: 'extension-duplicate-id', severity: 'error', extensionId: 'x' })]);
  });

  it('an unreadable step is not checked further', () => {
    const problems = validate(story([step('a', 0, { readable: false, from: 'ghost' })]), index);
    expect(codes(problems)).toEqual(['step-unreadable']);
  });
});
