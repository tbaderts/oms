import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { StoryboardService } from '../../src/main/storyboards/StoryboardService';
import { draftOf, patchFromDraft } from '../../src/renderer/views/storyboards/stepDraft';
import { DEFAULT_STORYBOARDS_CONFIG } from '../../src/shared/types/storyboards';
import { createStoryboardWorkspace, type StoryboardWorkspace } from '../fixtures/storyboards';

const ID = 'buy-gold-mobile';
const STEP = [
  '---',
  'id: accept-quote',
  'title: Accept quote',
  'kind: user',
  'from: customer',
  'to: app',
  'links: { requirements: [FR-001] }',
  'extensions:',
  '  - id: too-late',
  '    when: The quote expired',
  '    then: The customer gets a new quote',
  '---',
  '',
  '## What happens',
  '',
  'The customer accepts.',
  '',
].join('\n');

/** The editor's save path end to end: detail → draft → user edit → patch → service → file. */
function editAndSave(ws: StoryboardWorkspace, edit: (d: ReturnType<typeof draftOf>) => void) {
  const svc = new StoryboardService({ workspaceRoot: ws.root, kbPath: path.join(ws.root, 'oms-knowledge-base'), config: DEFAULT_STORYBOARDS_CONFIG });
  svc.scan();
  const d = svc.detail(ID);
  if (!d.ok) throw new Error(d.message);
  const step = d.detail.steps.find((s) => s.id === 'accept-quote')!;
  const draft = draftOf(step);
  edit(draft);
  const { patch, body } = patchFromDraft(step, draft);
  return { result: svc.saveStep(ID, step.id, patch, body, step.revision), patch };
}

describe('step editor save: only what the user changed reaches the file', () => {
  let ws: StoryboardWorkspace;
  afterEach(() => ws?.cleanup());

  it('a title-only edit changes exactly the title line', () => {
    ws = createStoryboardWorkspace();
    const dir = ws.writeExample();
    const file = `${dir}/steps/accept-quote.md`;
    ws.write({ [file]: STEP });
    const { result, patch } = editAndSave(ws, (draft) => {
      draft.title = 'Accept the quote';
    });
    expect(patch).toEqual({ title: 'Accept the quote' });
    expect(result).toMatchObject({ ok: true, changed: true });
    expect(ws.read(file)).toBe(STEP.replace('title: Accept quote', 'title: Accept the quote'));
  });

  it('an unchanged draft sends no keys and writes nothing', () => {
    ws = createStoryboardWorkspace();
    const dir = ws.writeExample();
    ws.write({ [`${dir}/steps/accept-quote.md`]: STEP });
    const { result, patch } = editAndSave(ws, () => undefined);
    expect(patch).toEqual({});
    expect(result).toMatchObject({ ok: true, changed: false });
  });

  it('clearing a lane sends null, and adding a link rewrites only the links key', () => {
    ws = createStoryboardWorkspace();
    const dir = ws.writeExample();
    const file = `${dir}/steps/accept-quote.md`;
    ws.write({ [file]: STEP });
    const { patch } = editAndSave(ws, (draft) => {
      draft.to = '';
      draft.links = { ...draft.links, events: ['OrderMessage'] };
    });
    expect(patch).toEqual({ to: null, links: { requirements: ['FR-001'], events: ['OrderMessage'] } });
    const text = ws.read(file);
    expect(text).not.toMatch(/^to:/m);
    expect(text).toContain('extensions:\n  - id: too-late\n    when: The quote expired\n    then: The customer gets a new quote\n');
    expect(text).not.toContain('api: []');
  });

  it('the service treats an empty list or empty links as an absent key', () => {
    ws = createStoryboardWorkspace();
    const dir = ws.writeExample();
    const file = `${dir}/steps/accept-quote.md`;
    ws.write({ [file]: STEP });
    const svc = new StoryboardService({ workspaceRoot: ws.root, kbPath: path.join(ws.root, 'oms-knowledge-base'), config: DEFAULT_STORYBOARDS_CONFIG });
    svc.scan();
    const d = svc.detail(ID);
    if (!d.ok) throw new Error(d.message);
    const step = d.detail.steps[1];
    expect(svc.saveStep(ID, step.id, { in: [], out: [], illustrations: [], links: { requirements: ['FR-001'], api: [] } }, step.body, step.revision))
      .toMatchObject({ ok: true, changed: false });
    expect(ws.read(file)).toBe(STEP);
  });
});
