import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { StoryboardService } from '../../src/main/storyboards/StoryboardService';
import { DEFAULT_STORYBOARDS_CONFIG, type LinkIndex } from '../../src/shared/types/storyboards';
import { STEP_BODY, createStoryboardWorkspace, md, type StoryboardWorkspace } from '../fixtures/storyboards';

const index: LinkIndex = { api: ['oms-cmd-api#executeCommand'], events: ['OrderMessage'], states: ['NEW -> UNACK'], requirements: ['FR-001'] };

function service(ws: StoryboardWorkspace) {
  return new StoryboardService({
    workspaceRoot: ws.root,
    kbPath: path.join(ws.root, 'oms-knowledge-base'),
    config: DEFAULT_STORYBOARDS_CONFIG,
    linkIndex: { get: () => index },
  });
}

describe('StoryboardService.detail', () => {
  let ws: StoryboardWorkspace;
  afterEach(() => ws?.cleanup());

  it('returns the story with steps in story.md order, resolved illustrations, headings and revisions', () => {
    ws = createStoryboardWorkspace();
    ws.writeExample();
    const svc = service(ws);
    svc.scan();
    const result = svc.detail('buy-gold-mobile');
    if (!result.ok) throw new Error(result.message);
    const d = result.detail;
    expect(d.steps.map((s) => [s.index, s.id])).toEqual([[0, 'request-quote'], [1, 'accept-quote'], [2, 'route-to-market']]);
    expect(d.lanes.map((l) => l.id)).toEqual(['customer', 'app', 'oms', 'market']);
    expect(d.steps[1].illustrations).toEqual([
      { src: 'accept-quote.excalidraw.svg', caption: 'Customer taps Buy', url: 'storyboard-asset://buy-gold-mobile/accept-quote.excalidraw.svg', missing: false, editable: true },
    ]);
    expect(d.steps[2].extensions[0]).toMatchObject({ id: 'venue-rejects', label: '3a', continueAt: { kind: 'end' } });
    expect(d.steps[0].headings.map((h) => h.anchor)).toEqual(['what-happens', 'business-rules', 'notes']);
    expect(d.headings.map((h) => h.text)).toEqual(['Summary', 'Scope and assumptions']);
    expect(d.revision).toMatch(/^\d+-[0-9a-f]{16}$/);
    expect(d.steps.every((s) => /^\d+-[0-9a-f]{16}$/.test(s.revision))).toBe(true);
    expect(d.problems).toEqual([]);
    expect(d.evidence).toBeNull();
  });

  it('a broken storyboard still opens and reports each problem', () => {
    ws = createStoryboardWorkspace();
    const dir = ws.writeExample();
    ws.write({
      // story lists a missing step; one step uses an undeclared lane, a missing image and an unknown link
      [`${dir}/story.md`]: md(
        { id: 'buy-gold-mobile', title: 'Broken', status: 'draft', lanes: [{ id: 'oms', label: 'OMS', kind: 'system' }], steps: ['request-quote', 'ghost', 'route-to-market'] },
        '\n## Summary\n\nBroken.\n',
      ),
      [`${dir}/steps/request-quote.md`]: md(
        { id: 'request-quote', title: 'Request quote', kind: 'user', from: 'customer', to: 'oms', illustrations: [{ src: 'nope.png' }], links: { api: ['oms-cmd-api#nope'] } },
        STEP_BODY,
      ),
    });
    const svc = service(ws);
    svc.scan();
    const result = svc.detail('buy-gold-mobile');
    if (!result.ok) throw new Error(result.message);
    expect(result.detail.steps.map((s) => [s.id, s.readable])).toEqual([['request-quote', true], ['ghost', false], ['route-to-market', true]]);
    expect(result.detail.orphanSteps).toEqual(['accept-quote']);
    const codes = result.detail.problems.map((p) => `${p.code}:${p.stepId}`);
    expect(codes).toEqual(expect.arrayContaining([
      'unknown-lane:request-quote',
      'missing-illustration:request-quote',
      'unresolved-link:request-quote',
      'step-unreadable:ghost',
      'unknown-lane:route-to-market',
      'orphan-step:accept-quote',
    ]));
  });

  it('reports exactly one problem per defect, with its severity, for all 11 codes', () => {
    ws = createStoryboardWorkspace();
    const dir = 'oms-knowledge-base/storyboards/d/all-defects';
    const lanes = [{ id: 'customer', label: 'Customer', kind: 'actor' }, { id: 'app', label: 'App', kind: 'channel' }];
    ws.write({
      [`${dir}/story.md`]: md({ id: 'all-defects', title: 'All defects', status: 'draft', lanes, steps: ['a', 'ghost', 'c', 'd'] }),
      [`${dir}/steps/a.md`]: md({
        id: 'a', title: 'A', kind: 'user', from: 'customer', to: 'app',
        illustrations: [{ src: 'missing.png' }],
        links: { api: ['oms-cmd-api#nope'] },
        in: [{ name: 'P', origin: { kind: 'unknown' } }],
        out: [{ name: 'Lost' }],
      }, STEP_BODY),
      [`${dir}/steps/c.md`]: md({
        id: 'c', title: 'C', kind: 'system', from: 'nobody', to: 'app',
        in: [{ name: 'Q', origin: { kind: 'step', ref: 'd' } }],
        extensions: [
          { id: 'jump', when: 'w', then: 't', continueAt: { kind: 'step', step: 'zzz' } },
          { id: 'back', when: 'w', then: 't', continueAt: { kind: 'step', step: 'a' } },
          { id: 'dup', when: 'w', then: 't', continueAt: { kind: 'end' } },
          { id: 'dup', when: 'w', then: 't', continueAt: { kind: 'end' } },
        ],
      }, STEP_BODY),
      [`${dir}/steps/d.md`]: md({ id: 'd', title: 'D', kind: 'system', from: 'app', to: 'customer' }, STEP_BODY),
      [`${dir}/steps/orphan.md`]: md({ id: 'orphan', title: 'Orphan', kind: 'system' }, STEP_BODY),
    });
    const svc = service(ws);
    svc.scan();
    const r = svc.detail('all-defects');
    if (!r.ok) throw new Error(r.message);
    expect(r.detail.problems.map((p) => `${p.code}:${p.severity}:${p.stepId}`).sort()).toEqual([
      'data-never-read:warning:a',
      'data-no-source:warning:a',
      'data-origin-unresolved:warning:c',
      'extension-backward-target:error:c',
      'extension-duplicate-id:error:c',
      'extension-unknown-target:error:c',
      'missing-illustration:warning:a',
      'orphan-step:warning:orphan',
      'step-unreadable:error:ghost',
      'unknown-lane:error:c',
      'unresolved-link:warning:a',
    ]);
  });

  it('refuses ids that the last scan does not know, and invalid ids', () => {
    ws = createStoryboardWorkspace();
    ws.writeExample();
    const svc = service(ws);
    expect(svc.detail('buy-gold-mobile')).toMatchObject({ ok: false, code: 'not-found' });
    svc.scan();
    for (const id of ['nope', '../buy-gold-mobile', 'oms-knowledge-base/storyboards', '']) {
      expect(svc.detail(id)).toMatchObject({ ok: false, code: 'not-found' });
    }
  });

  it('gives illustrations with an unsafe src no URL and marks them missing', () => {
    ws = createStoryboardWorkspace();
    const dir = ws.writeExample();
    ws.write({
      [`${dir}/steps/request-quote.md`]: md(
        { id: 'request-quote', title: 'Request quote', kind: 'user', illustrations: [{ src: '../assets/accept-quote.excalidraw.svg' }, { src: '/etc/passwd' }] },
        STEP_BODY,
      ),
    });
    const svc = service(ws);
    svc.scan();
    const result = svc.detail('buy-gold-mobile');
    if (!result.ok) throw new Error(result.message);
    expect(result.detail.steps[0].illustrations.map((i) => [i.url, i.missing])).toEqual([[null, true], [null, true]]);
  });
});
