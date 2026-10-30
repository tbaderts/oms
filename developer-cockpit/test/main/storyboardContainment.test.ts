import * as fs from 'fs';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { StoryboardService } from '../../src/main/storyboards/StoryboardService';
import { DEFAULT_STORYBOARDS_CONFIG } from '../../src/shared/types/storyboards';
import { EXCALIDRAW_SVG, createStoryboardWorkspace, md, treeSnapshot, type StoryboardWorkspace } from '../fixtures/storyboards';

const ID = 'buy-gold-mobile';

/** Moves a storyboard's sub-folder outside the root and links it back (a junction on Windows). */
function linkOut(ws: StoryboardWorkspace, dir: string, sub: 'steps' | 'assets') {
  fs.renameSync(path.join(ws.root, dir, sub), path.join(ws.root, `outside-${sub}`));
  ws.symlink(`outside-${sub}`, `${dir}/${sub}`, 'dir');
}

function service(ws: StoryboardWorkspace) {
  const svc = new StoryboardService({ workspaceRoot: ws.root, kbPath: path.join(ws.root, 'oms-knowledge-base'), config: DEFAULT_STORYBOARDS_CONFIG });
  svc.scan();
  return svc;
}

const detail = (svc: StoryboardService) => {
  const r = svc.detail(ID);
  if (!r.ok) throw new Error(r.message);
  return r.detail;
};

describe('storyboard folder containment', () => {
  let ws: StoryboardWorkspace;
  afterEach(() => ws?.cleanup());

  it('a linked assets/ folder is a scan error, its files count as missing, and nothing is written or deleted through it', () => {
    ws = createStoryboardWorkspace();
    const dir = ws.writeExample();
    linkOut(ws, dir, 'assets');
    const svc = new StoryboardService({ workspaceRoot: ws.root, kbPath: path.join(ws.root, 'oms-knowledge-base'), config: DEFAULT_STORYBOARDS_CONFIG });
    const scan = svc.scan();
    expect(scan.catalogue.map((s) => s.id)).toEqual([ID]);
    expect(scan.errors).toEqual([expect.objectContaining({ code: 'symlink', path: `${dir}/assets` })]);
    const d = detail(svc);
    expect(d.steps[1].illustrations[0]).toMatchObject({ missing: true });

    const outside = treeSnapshot(path.join(ws.root, 'outside-assets'));
    expect(svc.saveIllustration(ID, 'written.excalidraw.svg', EXCALIDRAW_SVG)).toMatchObject({ ok: false, code: 'invalid' });
    expect(svc.deleteStep(ID, 'accept-quote', true, d.revision)).toMatchObject({ ok: false, code: 'invalid' });
    expect(svc.saveStep(ID, 'request-quote', { title: 'x' }, d.steps[0].body, d.steps[0].revision)).toMatchObject({ ok: false, code: 'invalid' });
    expect(treeSnapshot(path.join(ws.root, 'outside-assets'))).toEqual(outside);
  });

  it('a linked steps/ folder makes the steps unreadable and refuses every write', () => {
    ws = createStoryboardWorkspace();
    const dir = ws.writeExample();
    linkOut(ws, dir, 'steps');
    const svc = service(ws);
    const d = detail(svc);
    expect(d.steps.every((s) => !s.readable && /linked folder/.test(s.unreadableReason ?? ''))).toBe(true);
    expect(d.orphanSteps).toEqual([]);
    const outside = treeSnapshot(path.join(ws.root, 'outside-steps'));
    expect(svc.createStep(ID, 'New step', null, d.revision)).toMatchObject({ ok: false, code: 'invalid' });
    expect(svc.saveStep(ID, 'request-quote', { title: 'x' }, '', 'any')).toMatchObject({ ok: false, code: 'invalid' });
    expect(svc.deleteStep(ID, 'request-quote', true, d.revision)).toMatchObject({ ok: false, code: 'invalid' });
    expect(treeSnapshot(path.join(ws.root, 'outside-steps'))).toEqual(outside);
  });

  it('a step id that is not a slug is never used as a path, even from story.md', () => {
    ws = createStoryboardWorkspace();
    const dir = ws.writeExample();
    ws.write({ 'victim.md': 'keep me', [`${dir}/story.md`]: ws.read(`${dir}/story.md`).replace('  - route-to-market\n', '  - route-to-market\n  - ../../../../victim\n') });
    const svc = service(ws);
    const d = detail(svc);
    expect(d.steps.at(-1)).toMatchObject({ readable: false });
    expect(svc.deleteStep(ID, '../../../../victim', true, d.revision)).toMatchObject({ ok: false, code: 'invalid' });
    expect(ws.read('victim.md')).toBe('keep me');
  });

  it('create refuses a domain path that runs through a linked folder, and writes nothing outside the root', () => {
    ws = createStoryboardWorkspace();
    ws.writeExample();
    ws.write({ 'outside-domain/.keep': '' });
    ws.symlink('outside-domain', 'oms-knowledge-base/storyboards/linked', 'dir');
    const svc = service(ws);
    const rootId = svc.scan().roots[0].rootId;
    const lanes = [{ id: 'oms', label: 'OMS', kind: 'system' as const }];
    for (const domain of ['linked', 'linked/nested']) {
      expect(svc.create({ rootId, domain, title: 'Escape', lanes, stepTitles: ['One'] })).toMatchObject({ ok: false, code: 'invalid' });
    }
    expect(fs.readdirSync(path.join(ws.root, 'outside-domain'))).toEqual(['.keep']);
    // a real nested domain still works
    expect(svc.create({ rootId, domain: 'real/nested', title: 'Fine', lanes, stepTitles: ['One'] })).toMatchObject({ ok: true, id: 'fine' });
  });

  it('a linked _templates/ folder is not used for new steps', () => {
    ws = createStoryboardWorkspace();
    ws.writeExample();
    ws.write({ 'outside-templates/step.md': md({ id: '{{id}}', title: '{{title}}', kind: 'manual', leaked: true }) });
    ws.symlink('outside-templates', 'oms-knowledge-base/storyboards/_templates', 'dir');
    const svc = service(ws);
    const r = svc.createStep(ID, 'Fresh', null, detail(svc).revision);
    expect(r).toMatchObject({ ok: true, stepId: 'fresh' });
    expect(ws.read('oms-knowledge-base/storyboards/precious-metals/buy-gold-mobile/steps/fresh.md')).not.toContain('leaked');
  });
});
