import * as fs from 'fs';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { runCheck } from '../../src/main/storyboards/cli/checkStoryboards';
import { createStoryboardWorkspace, md, type StoryboardWorkspace } from '../fixtures/storyboards';
import { REPO_ROOT } from '../fixtures/workspace';

function run(ws: StoryboardWorkspace, strict: boolean) {
  const lines: string[] = [];
  const code = runCheck({ workspace: ws.root, strict, env: {}, out: (l) => lines.push(l) });
  return { code, text: lines.join('\n') };
}

/** A clean storyboard with an evidence card pinned to the current commit. */
function evidenced() {
  const ws = createStoryboardWorkspace({ git: true });
  ws.write({ 'oms-core/src/Main.java': 'class Main {}\n', 'oms-knowledge-base/domain/order.md': md({ title: 'Order' }) });
  const dir = ws.writeExample();
  ws.git('add', '.');
  ws.git('commit', '-q', '-m', 'base');
  const commit = ws.git('rev-parse', '--short', 'HEAD');
  ws.write({
    [`${dir}/story.card.yaml`]: stringify({
      id: 'buy-gold-mobile',
      kb_links: ['/domain/order.md'],
      evidence: { repos: [{ module: 'oms-core', commit }], sources: [{ module: 'oms-core', path: 'src/Main.java', line: 1 }] },
    }),
  });
  return { ws, dir };
}

describe('check:storyboards on the repository corpus', () => {
  it('repository corpus passes normal and strict', () => {
    for (const strict of [false, true]) {
      const lines: string[] = [];
      const code = runCheck({ workspace: REPO_ROOT, strict, env: {}, out: (l) => lines.push(l) });
      // Intended to go red when a commit changes code a storyboard cites: review the storyboard, then re-pin its card.
      const hint = 'If drift is reported, review the storyboard and re-pin story.card.yaml (see oms-knowledge-base/storyboards/README.md).';
      expect(code, `${lines.join('\n')}\n${hint}`).toBe(0);
      expect(lines.join('\n')).toMatch(/place-and-fill-order\s+draft\s+trust=evidenced\s+drift=current\s+0 error\(s\), 0 warning\(s\)/);
    }
  });

  it('ships templates and a well-formed stencil library', () => {
    const root = path.join(REPO_ROOT, 'oms-knowledge-base', 'storyboards');
    for (const t of ['story.md', 'step.md']) expect(fs.readFileSync(path.join(root, '_templates', t), 'utf8')).toContain('id: {{id}}');
    const lib = JSON.parse(fs.readFileSync(path.join(root, '_library', 'oms-storyboard.excalidrawlib'), 'utf8'));
    expect(lib).toMatchObject({ type: 'excalidrawlib', version: 2 });
    expect(lib.libraryItems.map((i: { name: string }) => i.name)).toEqual(
      expect.arrayContaining(['person', 'phone frame', 'desktop window', 'service box', 'OMS box', 'venue / exchange', 'back-office ledger', 'document', 'message envelope']),
    );
    expect(lib.libraryItems.every((i: { elements: unknown[] }) => i.elements.length > 0)).toBe(true);
  });
});

describe('check:storyboards', () => {
  let ws: StoryboardWorkspace;
  afterEach(() => ws?.cleanup());

  it('passes both modes for a clean, evidenced corpus and lists provenance', () => {
    ({ ws } = evidenced());
    const normal = run(ws, false);
    expect(normal.code).toBe(0);
    expect(normal.text).toMatch(/buy-gold-mobile\s+draft\s+trust=evidenced\s+drift=current\s+0 error\(s\), 0 warning\(s\)/);
    expect(run(ws, true).code).toBe(0);
  });

  it('normal mode fails on a structural error', () => {
    let dir: string;
    ({ ws, dir } = evidenced());
    ws.write({ [`${dir}/steps/request-quote.md`]: ws.read(`${dir}/steps/request-quote.md`).replace('from: customer', 'from: nobody') });
    const r = run(ws, false);
    expect(r.code).toBe(1);
    expect(r.text).toContain('unknown-lane');
  });

  it('normal mode fails on scan errors and on broken evidence', () => {
    let dir: string;
    ({ ws, dir } = evidenced());
    ws.write({ ['oms-knowledge-base/storyboards/bad/x/story.md']: '---\nid: [oops\n---\n' });
    expect(run(ws, false)).toMatchObject({ code: 1 });
    ws.write({ ['oms-knowledge-base/storyboards/bad/x/story.md']: md({ id: 'x', title: 'X', status: 'draft', lanes: [], steps: [] }) });
    expect(run(ws, false).code).toBe(0);
    ws.write({ [`${dir}/story.card.yaml`]: ws.read(`${dir}/story.card.yaml`).replace('/domain/order.md', '/domain/missing.md') });
    const r = run(ws, false);
    expect(r.code).toBe(1);
    expect(r.text).toContain('kb-link-missing');
  });

  it('strict mode also fails on warnings, drift and unevidenced storyboards; normal mode does not', () => {
    let dir: string;
    ({ ws, dir } = evidenced());
    // a warning: an unread output
    ws.write({ [`${dir}/steps/route-to-market.md`]: ws.read(`${dir}/steps/route-to-market.md`).replace('- name: Market instruction\n    final: true', '- name: Market instruction') });
    expect(run(ws, false).code).toBe(0);
    expect(run(ws, true).code).toBe(1);
    ws.write({ [`${dir}/steps/route-to-market.md`]: ws.read(`${dir}/steps/route-to-market.md`).replace('- name: Market instruction\n', '- name: Market instruction\n    final: true\n') });
    expect(run(ws, true).code).toBe(0);

    // drift: a committed change to the cited line
    ws.write({ 'oms-core/src/Main.java': 'class Main { int x; }\n' });
    ws.git('commit', '-q', '-am', 'change');
    expect(run(ws, false).code).toBe(0);
    const drifted = run(ws, true);
    expect(drifted.code).toBe(1);
    expect(drifted.text).toContain('drift=drifted');

    // unevidenced: no card at all
    fs.rmSync(path.join(ws.root, dir, 'story.card.yaml'));
    expect(run(ws, false).code).toBe(0);
    expect(run(ws, true).text).toContain('trust=unevidenced');
    expect(run(ws, true).code).toBe(1);
  });
});
