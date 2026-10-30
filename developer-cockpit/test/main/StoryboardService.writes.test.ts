import * as fs from 'fs';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { StoryboardService } from '../../src/main/storyboards/StoryboardService';
import { DEFAULT_STORYBOARDS_CONFIG, type StoryboardsConfig } from '../../src/shared/types/storyboards';
import { EXCALIDRAW_SVG, createStoryboardWorkspace, treeSnapshot, type StoryboardWorkspace } from '../fixtures/storyboards';

const ID = 'buy-gold-mobile';
const LANES = [
  { id: 'trader', label: 'Trader', kind: 'actor' as const },
  { id: 'oms', label: 'OMS', kind: 'system' as const },
];

function setup(config: Partial<StoryboardsConfig> = {}) {
  const ws = createStoryboardWorkspace();
  const dir = ws.writeExample();
  const svc = new StoryboardService({
    workspaceRoot: ws.root,
    kbPath: path.join(ws.root, 'oms-knowledge-base'),
    config: { ...DEFAULT_STORYBOARDS_CONFIG, ...config },
  });
  svc.scan();
  return { ws, dir, svc };
}

function detail(svc: StoryboardService) {
  const r = svc.detail(ID);
  if (!r.ok) throw new Error(r.message);
  return r.detail;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('StoryboardService writes: save', () => {
  let ws: StoryboardWorkspace;
  afterEach(() => ws?.cleanup());

  it('save keeps unknown front-matter keys, comments and flow style, and changes only the patched key (step)', () => {
    let svc: StoryboardService;
    let dir: string;
    ({ ws, svc, dir } = setup());
    const file = `${dir}/steps/request-quote.md`;
    ws.write({
      [file]: '---\nid: request-quote\n# reviewed by ops\ntitle: Request quote\nkind: user\nfrom: customer\nto: app\nx-review: { by: ops, ticket: OPS-12 }\nout: [{ name: Quote }]\n---\n\n## What happens\n\nThe customer asks.\n',
    });
    const before = detail(svc).steps[0];
    const r = svc.saveStep(ID, 'request-quote', { title: 'Ask for a quote' }, before.body, before.revision);
    expect(r).toMatchObject({ ok: true, changed: true });
    expect(ws.read(file)).toBe(
      '---\nid: request-quote\n# reviewed by ops\ntitle: Ask for a quote\nkind: user\nfrom: customer\nto: app\nx-review: { by: ops, ticket: OPS-12 }\nout: [{ name: Quote }]\n---\n\n## What happens\n\nThe customer asks.\n',
    );
    expect(detail(svc).steps[0].revision).toBe((r as { revision: string }).revision);
  });

  it('save keeps unknown keys (story) and can change the body only', () => {
    let svc: StoryboardService;
    let dir: string;
    ({ ws, svc, dir } = setup());
    const file = `${dir}/story.md`;
    const original = ws.read(file).replace('owner: analyst-id\n', 'owner: analyst-id\nreview-board: retail\n');
    ws.write({ [file]: original });
    const d = detail(svc);
    const r = svc.saveStory(ID, { status: 'stable' }, `${d.body}\nMore text.\n`, d.revision);
    expect(r).toMatchObject({ ok: true, changed: true });
    const text = ws.read(file);
    expect(text).toContain('review-board: retail\n');
    expect(text).toContain('status: stable\n');
    expect(text.endsWith('More text.\n')).toBe(true);
    expect(text.replace('status: stable', 'status: draft').replace('\nMore text.\n', '')).toBe(original);
  });

  it('an unchanged save writes nothing: same bytes, same mtime (story and step)', async () => {
    let svc: StoryboardService;
    let dir: string;
    ({ ws, svc, dir } = setup());
    const d = detail(svc);
    const stepFile = path.join(ws.root, dir, 'steps', 'accept-quote.md');
    const storyFile = path.join(ws.root, dir, 'story.md');
    const [stepBefore, storyBefore] = [fs.statSync(stepFile).mtimeMs, fs.statSync(storyFile).mtimeMs];
    const stepBytes = fs.readFileSync(stepFile);
    await sleep(20);
    const s = d.steps[1];
    expect(svc.saveStep(ID, s.id, { title: s.title, kind: s.kind, from: s.from, to: s.to }, s.body, s.revision)).toMatchObject({ ok: true, changed: false, revision: s.revision });
    expect(svc.saveStory(ID, { title: d.title, status: d.status }, d.body, d.revision)).toMatchObject({ ok: true, changed: false });
    expect(fs.statSync(stepFile).mtimeMs).toBe(stepBefore);
    expect(fs.statSync(storyFile).mtimeMs).toBe(storyBefore);
    expect(fs.readFileSync(stepFile).equals(stepBytes)).toBe(true);
  });

  it('a stale revision conflicts, carries the latest revision and leaves the file untouched (step)', () => {
    let svc: StoryboardService;
    let dir: string;
    ({ ws, svc, dir } = setup());
    const s = detail(svc).steps[0];
    const file = `${dir}/steps/request-quote.md`;
    ws.write({ [file]: ws.read(file).replace('Something happens.', 'Edited elsewhere.') });
    const onDisk = ws.read(file);
    const r = svc.saveStep(ID, s.id, { title: 'Mine' }, s.body, s.revision);
    expect(r).toMatchObject({ ok: false, code: 'conflict' });
    const latest = (r as { latestRevision: string }).latestRevision;
    expect(latest).toBe(detail(svc).steps[0].revision);
    expect(ws.read(file)).toBe(onDisk);
    // intentional overwrite: resend against the latest revision
    expect(svc.saveStep(ID, s.id, { title: 'Mine' }, s.body, latest)).toMatchObject({ ok: true, changed: true });
    expect(ws.read(file)).toContain('title: Mine');
  });

  it('a stale revision conflicts (story)', () => {
    let svc: StoryboardService;
    let dir: string;
    ({ ws, svc, dir } = setup());
    const d = detail(svc);
    ws.write({ [`${dir}/story.md`]: ws.read(`${dir}/story.md`) + '\nAppended elsewhere.\n' });
    const onDisk = ws.read(`${dir}/story.md`);
    const r = svc.saveStory(ID, { title: 'X' }, d.body, d.revision);
    expect(r).toMatchObject({ ok: false, code: 'conflict' });
    expect((r as { latestRevision: string }).latestRevision).toBe(detail(svc).revision);
    expect(ws.read(`${dir}/story.md`)).toBe(onDisk);
  });

  it('rejects patches with unknown keys or wrong types, and invalid ids', () => {
    let svc: StoryboardService;
    ({ ws, svc } = setup());
    const s = detail(svc).steps[0];
    const d = detail(svc);
    expect(svc.saveStep(ID, s.id, { id: 'renamed' } as never, s.body, s.revision)).toMatchObject({ ok: false, code: 'invalid' });
    expect(svc.saveStep(ID, s.id, { kind: 'robot' } as never, s.body, s.revision)).toMatchObject({ ok: false, code: 'invalid' });
    expect(svc.saveStep(ID, s.id, { extensions: [{ id: 'Bad Id', when: 'x', then: 'y', continueAt: { kind: 'end' } }] }, s.body, s.revision)).toMatchObject({ ok: false, code: 'invalid' });
    expect(svc.saveStep(ID, s.id, { illustrations: [{ src: '../x.svg' }] }, s.body, s.revision)).toMatchObject({ ok: false, code: 'invalid' });
    expect(svc.saveStory(ID, { steps: ['x'] } as never, d.body, d.revision)).toMatchObject({ ok: false, code: 'invalid' });
    expect(svc.saveStory(ID, { lanes: [{ id: 'A B', label: 'x', kind: 'actor' }] }, d.body, d.revision)).toMatchObject({ ok: false, code: 'invalid' });
    expect(svc.saveStep(ID, '../story', { title: 'x' }, s.body, s.revision)).toMatchObject({ ok: false, code: 'not-found' });
    expect(svc.saveStep('nope', s.id, { title: 'x' }, s.body, s.revision)).toMatchObject({ ok: false, code: 'not-found' });
    expect(svc.saveStep(ID, 'ghost', { title: 'x' }, s.body, s.revision)).toMatchObject({ ok: false, code: 'not-found' });
  });

  it('removes a key when the patch sets it to null, and keeps CRLF files CRLF', () => {
    let svc: StoryboardService;
    let dir: string;
    ({ ws, svc, dir } = setup());
    const file = `${dir}/steps/request-quote.md`;
    ws.write({ [file]: ws.read(file).replace(/\n/g, '\r\n') });
    const s = detail(svc).steps[0];
    expect(svc.saveStep(ID, s.id, { to: null }, s.body.replace(/\r\n/g, '\n'), s.revision)).toMatchObject({ ok: true, changed: true });
    const text = ws.read(file);
    expect(text).not.toMatch(/^to:/m);
    expect(text.split('\n').slice(0, -1).every((l) => l.endsWith('\r'))).toBe(true);
  });

  it('leaves no temporary files behind', () => {
    let svc: StoryboardService;
    let dir: string;
    ({ ws, svc, dir } = setup());
    const s = detail(svc).steps[0];
    svc.saveStep(ID, s.id, { title: 'T' }, s.body, s.revision);
    expect(fs.readdirSync(path.join(ws.root, dir, 'steps')).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });
});

describe('StoryboardService writes: reorder, createStep, deleteStep', () => {
  let ws: StoryboardWorkspace;
  afterEach(() => ws?.cleanup());

  const stepsBlock = /^steps:\n(?:  - .*\n)+/m;

  it('reorder relabels extensions and rewrites only the steps list', () => {
    let svc: StoryboardService;
    let dir: string;
    ({ ws, svc, dir } = setup());
    const accept = `${dir}/steps/accept-quote.md`;
    ws.write({
      [accept]: ws.read(accept).replace('---\n\n## What', 'extensions:\n  - { id: quote-expired, when: Too late, then: Re-quote, continueAt: { kind: stay } }\n  - { id: no-funds, when: No funds, then: Stop, continueAt: { kind: end } }\n---\n\n## What'),
    });
    expect(detail(svc).steps[1].extensions.map((e) => e.label)).toEqual(['2a', '2b']);
    const stepFiles = ['request-quote', 'accept-quote', 'route-to-market'].map((s) => [s, ws.read(`${dir}/steps/${s}.md`)]);
    const storyBefore = ws.read(`${dir}/story.md`);

    const r = svc.reorder(ID, ['request-quote', 'route-to-market', 'accept-quote'], detail(svc).revision);
    expect(r).toMatchObject({ ok: true });
    const d = detail(svc);
    expect(d.steps.map((s) => s.id)).toEqual(['request-quote', 'route-to-market', 'accept-quote']);
    expect(d.steps[2].extensions.map((e) => e.label)).toEqual(['3a', '3b']);
    expect(d.steps[1].extensions.map((e) => e.label)).toEqual(['2a']);
    for (const [s, text] of stepFiles) expect(ws.read(`${dir}/steps/${s}.md`)).toBe(text);
    const storyAfter = ws.read(`${dir}/story.md`);
    expect(storyAfter.replace(stepsBlock, '')).toBe(storyBefore.replace(stepsBlock, ''));
    expect(storyAfter).toContain('steps:\n  - request-quote\n  - route-to-market\n  - accept-quote\n');
  });

  it('reorder accepts only a permutation of the current steps', () => {
    let svc: StoryboardService;
    ({ ws, svc } = setup());
    const rev = detail(svc).revision;
    for (const ids of [['request-quote', 'accept-quote'], ['request-quote', 'accept-quote', 'route-to-market', 'extra'], ['request-quote', 'request-quote', 'accept-quote'], ['a', 'b', 'c']]) {
      expect(svc.reorder(ID, ids, rev)).toMatchObject({ ok: false, code: 'invalid' });
    }
    expect(svc.reorder(ID, ['route-to-market', 'accept-quote', 'request-quote'], 'stale')).toMatchObject({ ok: false, code: 'conflict' });
  });

  it('createStep inserts after the given step, or at the end, with a unique slug and the house sections', () => {
    let svc: StoryboardService;
    let dir: string;
    ({ ws, svc, dir } = setup());
    const r1 = svc.createStep(ID, 'Check limits', 'request-quote', detail(svc).revision);
    expect(r1).toMatchObject({ ok: true, stepId: 'check-limits' });
    const r2 = svc.createStep(ID, 'Check limits', null, detail(svc).revision);
    expect(r2).toMatchObject({ ok: true, stepId: 'check-limits-2' });
    expect(detail(svc).steps.map((s) => s.id)).toEqual(['request-quote', 'check-limits', 'accept-quote', 'route-to-market', 'check-limits-2']);
    const text = ws.read(`${dir}/steps/check-limits.md`);
    expect(text).toMatch(/^---\nid: check-limits\ntitle: Check limits\nkind: system\n---\n/);
    expect(text).toContain('## What happens');
    expect(text).toContain('## Business rules');
    expect(text).toContain('## Notes');
    expect(detail(svc).problems).toEqual([]);
  });

  it('createStep uses the root template when present and rejects bad input', () => {
    let svc: StoryboardService;
    let dir: string;
    ({ ws, svc, dir } = setup());
    ws.write({ ['oms-knowledge-base/storyboards/_templates/step.md']: '---\nid: {{id}}\ntitle: {{title}}\nkind: manual\nowner-team: ops\n---\n\n## What happens\n\nTBD\n' });
    const r = svc.createStep(ID, 'Ops: "approve" #1', null, detail(svc).revision);
    expect(r).toMatchObject({ ok: true, stepId: 'ops-approve-1' });
    const text = ws.read(`${dir}/steps/ops-approve-1.md`);
    expect(text).toContain('owner-team: ops');
    expect(detail(svc).steps.at(-1)).toMatchObject({ title: 'Ops: "approve" #1', kind: 'manual', readable: true });
    expect(svc.createStep(ID, '!!!', null, detail(svc).revision)).toMatchObject({ ok: false, code: 'invalid' });
    expect(svc.createStep(ID, 'x', 'ghost', detail(svc).revision)).toMatchObject({ ok: false, code: 'invalid' });
    expect(svc.createStep(ID, 'x', null, 'stale')).toMatchObject({ ok: false, code: 'conflict' });
  });

  it('delete without deleteAssets keeps the file and assets and reports an orphan', () => {
    let svc: StoryboardService;
    let dir: string;
    ({ ws, svc, dir } = setup());
    const r = svc.deleteStep(ID, 'accept-quote', false, detail(svc).revision);
    expect(r).toMatchObject({ ok: true, deleted: [] });
    expect(fs.existsSync(path.join(ws.root, dir, 'steps', 'accept-quote.md'))).toBe(true);
    expect(fs.existsSync(path.join(ws.root, dir, 'assets', 'accept-quote.excalidraw.svg'))).toBe(true);
    const d = detail(svc);
    expect(d.steps.map((s) => s.id)).toEqual(['request-quote', 'route-to-market']);
    expect(d.problems).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'orphan-step', stepId: 'accept-quote' })]));
  });

  it('delete with deleteAssets removes the step file and only the assets no other step uses', () => {
    let svc: StoryboardService;
    let dir: string;
    ({ ws, svc, dir } = setup());
    const accept = `${dir}/steps/accept-quote.md`;
    ws.write({
      [`${dir}/assets/shared.png`]: Buffer.from([1]),
      [`${dir}/assets/own-ext.png`]: Buffer.from([2]),
      [accept]: ws.read(accept)
        .replace('illustrations:\n  - src: accept-quote.excalidraw.svg\n    caption: Customer taps Buy\n', 'illustrations:\n  - src: accept-quote.excalidraw.svg\n  - src: shared.png\n')
        .replace('---\n\n## What', 'extensions:\n  - { id: x, when: w, then: t, continueAt: { kind: end }, illustrations: [{ src: own-ext.png }] }\n---\n\n## What'),
      [`${dir}/steps/request-quote.md`]: ws.read(`${dir}/steps/request-quote.md`).replace('kind: user\n', 'kind: user\nillustrations:\n  - src: shared.png\n'),
    });
    const r = svc.deleteStep(ID, 'accept-quote', true, detail(svc).revision);
    expect(r).toMatchObject({ ok: true });
    expect((r as { deleted: string[] }).deleted.sort()).toEqual(['assets/accept-quote.excalidraw.svg', 'assets/own-ext.png', 'steps/accept-quote.md']);
    expect(fs.existsSync(path.join(ws.root, dir, 'assets', 'shared.png'))).toBe(true);
    expect(detail(svc).problems.filter((p) => p.code === 'orphan-step')).toEqual([]);
  });

  it('delete refuses an unlisted step and a stale revision', () => {
    let svc: StoryboardService;
    ({ ws, svc } = setup());
    expect(svc.deleteStep(ID, 'ghost', false, detail(svc).revision)).toMatchObject({ ok: false, code: 'invalid' });
    expect(svc.deleteStep(ID, 'accept-quote', false, 'stale')).toMatchObject({ ok: false, code: 'conflict' });
  });
});

describe('StoryboardService writes: create and read-only', () => {
  let ws: StoryboardWorkspace;
  afterEach(() => ws?.cleanup());

  it('create scaffolds story.md and one step per title from built-in templates, then lists the new storyboard', () => {
    let svc: StoryboardService;
    ({ ws, svc } = setup());
    const rootId = svc.scan().roots[0].rootId;
    const r = svc.create({ rootId, domain: 'order-lifecycle', title: 'Place and fill an order', lanes: LANES, stepTitles: ['Submit order', 'Fill arrives', 'Submit order'] });
    expect(r).toMatchObject({ ok: true, id: 'place-and-fill-an-order' });
    const dir = 'oms-knowledge-base/storyboards/order-lifecycle/place-and-fill-an-order';
    const story = ws.read(`${dir}/story.md`);
    expect(story).toContain('id: place-and-fill-an-order\n');
    expect(story).toContain('status: draft\n');
    expect(story).toContain('## Summary');
    expect(fs.existsSync(path.join(ws.root, dir, 'assets'))).toBe(true);
    const d = svc.detail('place-and-fill-an-order');
    if (!d.ok) throw new Error(d.message);
    expect(d.detail.steps.map((s) => [s.id, s.title])).toEqual([['submit-order', 'Submit order'], ['fill-arrives', 'Fill arrives'], ['submit-order-2', 'Submit order']]);
    expect(d.detail.lanes).toEqual(LANES);
    expect(d.detail.problems.filter((p) => p.severity === 'error')).toEqual([]);
    expect(svc.scan().catalogue.map((s) => s.id)).toContain('place-and-fill-an-order');
  });

  it('create uses the root templates when present', () => {
    let svc: StoryboardService;
    ({ ws, svc } = setup());
    ws.write({
      ['oms-knowledge-base/storyboards/_templates/story.md']: '---\nid: {{id}}\ntitle: {{title}}\nstatus: draft\nreview-board: retail\nlanes: []\nsteps: []\n---\n\n## Summary\n\nTBD.\n',
    });
    const rootId = svc.scan().roots[0].rootId;
    expect(svc.create({ rootId, domain: 'x', title: 'From template', lanes: LANES, stepTitles: ['One'] })).toMatchObject({ ok: true });
    const story = ws.read('oms-knowledge-base/storyboards/x/from-template/story.md');
    expect(story).toContain('review-board: retail');
    expect(story).toContain('  - one\n');
  });

  it('create rejects unknown roots, bad domains, duplicate ids, empty step lists and bad lanes', () => {
    let svc: StoryboardService;
    ({ ws, svc } = setup());
    const rootId = svc.scan().roots[0].rootId;
    const good = { rootId, domain: 'x', title: 'New one', lanes: LANES, stepTitles: ['A'] };
    expect(svc.create({ ...good, rootId: 'oms-knowledge-base/storyboards' })).toMatchObject({ ok: false, code: 'invalid' });
    expect(svc.create({ ...good, rootId: 'ffffffffffff' })).toMatchObject({ ok: false, code: 'invalid' });
    expect(svc.create({ ...good, domain: '../escape' })).toMatchObject({ ok: false, code: 'invalid' });
    expect(svc.create({ ...good, title: 'Buy gold mobile', domain: 'elsewhere' })).toMatchObject({ ok: false, code: 'exists' });
    expect(svc.create({ ...good, title: 'Sell gold' })).toMatchObject({ ok: true });
    expect(svc.create({ ...good, title: 'Sell gold' })).toMatchObject({ ok: false, code: 'exists' });
    expect(svc.create({ ...good, stepTitles: [] })).toMatchObject({ ok: false, code: 'invalid' });
    expect(svc.create({ ...good, lanes: [{ id: 'A B', label: 'x', kind: 'actor' }] } as never)).toMatchObject({ ok: false, code: 'invalid' });
  });

  it('read-only rejects every write and changes nothing on disk', () => {
    let svc: StoryboardService;
    ({ ws, svc } = setup({ writable: false }));
    const before = treeSnapshot(ws.root);
    const d = svc.detail(ID);
    if (!d.ok) throw new Error(d.message);
    const s = d.detail.steps[0];
    const rootId = svc.scan().roots[0].rootId;
    const results = [
      svc.create({ rootId, domain: 'x', title: 'New', lanes: LANES, stepTitles: ['A'] }),
      svc.saveStory(ID, { title: 'x' }, d.detail.body, d.detail.revision),
      svc.saveStep(ID, s.id, { title: 'x' }, s.body, s.revision),
      svc.createStep(ID, 'x', null, d.detail.revision),
      svc.deleteStep(ID, s.id, true, d.detail.revision),
      svc.reorder(ID, [...d.detail.steps.map((x) => x.id)].reverse(), d.detail.revision),
      svc.saveIllustration(ID, 'new.excalidraw.svg', EXCALIDRAW_SVG),
    ];
    for (const r of results) expect(r).toMatchObject({ ok: false, code: 'read-only' });
    expect(treeSnapshot(ws.root)).toEqual(before);
  });
});

describe('StoryboardService writes: illustrations and library', () => {
  let ws: StoryboardWorkspace;
  afterEach(() => ws?.cleanup());

  it('saveIllustration writes an Excalidraw SVG byte for byte, keeping its embedded scene', () => {
    let svc: StoryboardService;
    let dir: string;
    ({ ws, svc, dir } = setup());
    const r = svc.saveIllustration(ID, 'route-to-market.excalidraw.svg', EXCALIDRAW_SVG);
    expect(r).toEqual({ ok: true, name: 'route-to-market.excalidraw.svg', url: 'storyboard-asset://buy-gold-mobile/route-to-market.excalidraw.svg' });
    expect(fs.readFileSync(path.join(ws.root, dir, 'assets', 'route-to-market.excalidraw.svg'), 'utf8')).toBe(EXCALIDRAW_SVG);
    // the step does not reference it until the step itself is saved
    expect(detail(svc).steps[2].illustrations).toEqual([]);
  });

  it('saveIllustration rejects unsafe SVGs and bad names, and writes nothing', () => {
    let svc: StoryboardService;
    ({ ws, svc } = setup({ maxAssetBytes: 64 * 1024 }));
    const before = treeSnapshot(ws.root);
    const svg = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
    expect(svc.saveIllustration(ID, 'x.excalidraw.svg', svg('<script>alert(1)</script>'))).toMatchObject({ ok: false, code: 'invalid' });
    expect(svc.saveIllustration(ID, 'x.excalidraw.svg', svg('<rect onload="x"/>'))).toMatchObject({ ok: false, code: 'invalid' });
    expect(svc.saveIllustration(ID, 'x.excalidraw.svg', svg('<image href="https://evil.example/p.png"/>'))).toMatchObject({ ok: false, code: 'invalid' });
    expect(svc.saveIllustration(ID, 'x.excalidraw.svg', svg(`<desc>${'x'.repeat(70 * 1024)}</desc>`))).toMatchObject({ ok: false, code: 'too-large' });
    for (const name of ['x.svg', 'x.png', '../x.excalidraw.svg', 'a/x.excalidraw.svg', 'X.excalidraw.svg']) {
      expect(svc.saveIllustration(ID, name, EXCALIDRAW_SVG)).toMatchObject({ ok: false, code: 'invalid' });
    }
    expect(treeSnapshot(ws.root)).toEqual(before);
  });

  it('library returns the root shared library, or null', () => {
    let svc: StoryboardService;
    ({ ws, svc } = setup());
    expect(svc.library(ID)).toEqual({ ok: true, library: null });
    ws.write({ ['oms-knowledge-base/storyboards/_library/oms-storyboard.excalidrawlib']: '{"type":"excalidrawlib","version":2,"libraryItems":[]}' });
    expect(svc.library(ID)).toEqual({ ok: true, library: '{"type":"excalidrawlib","version":2,"libraryItems":[]}' });
    expect(svc.library('nope')).toMatchObject({ ok: false, code: 'not-found' });
  });
});
