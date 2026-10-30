import * as fs from 'fs';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { EXCALIDRAW_SVG, createStoryboardWorkspace, treeSnapshot, type StoryboardWorkspace } from './storyboards';

describe('storyboard fixtures', () => {
  let ws: StoryboardWorkspace | undefined;
  afterEach(() => ws?.cleanup());

  it('writes the example story with parseable front matter and its asset', () => {
    ws = createStoryboardWorkspace();
    const dir = ws.writeExample();
    const story = ws.read(`${dir}/story.md`);
    const fm = parse(story.split('---\n')[1]);
    expect(fm.steps).toEqual(['request-quote', 'accept-quote', 'route-to-market']);
    expect(fs.existsSync(path.join(ws.root, dir, 'assets', 'accept-quote.excalidraw.svg'))).toBe(true);
    expect(EXCALIDRAW_SVG).toContain('payload-type:application/vnd.excalidraw+json');
  });

  it('creates symlinks when the OS allows it, and says so when it does not', () => {
    ws = createStoryboardWorkspace();
    ws.write({ 'a.txt': 'a' });
    const created = ws.symlink('a.txt', 'b.txt');
    expect(created).toBe(ws.symlinks);
    if (!ws.symlinks) console.info('[fixtures] file symlinks unsupported here; file-symlink cases are skipped');
    else expect(fs.lstatSync(path.join(ws.root, 'b.txt')).isSymbolicLink()).toBe(true);
  });

  it('always creates folder links (junctions on Windows) that lstat reports as symlinks', () => {
    ws = createStoryboardWorkspace();
    ws.write({ 'real/a.txt': 'a' });
    expect(ws.symlink('real', 'linked', 'dir')).toBe(true);
    expect(fs.lstatSync(path.join(ws.root, 'linked')).isSymbolicLink()).toBe(true);
  });

  it('snapshots change when a file changes', () => {
    ws = createStoryboardWorkspace();
    ws.write({ 'x/y.md': '1' });
    const before = treeSnapshot(ws.root);
    ws.write({ 'x/y.md': '2' });
    expect(treeSnapshot(ws.root)).not.toEqual(before);
  });

  it('initialises a git repository on request', () => {
    ws = createStoryboardWorkspace({ git: true });
    ws.write({ 'f.txt': 'x' });
    ws.git('add', '.');
    ws.git('commit', '-q', '-m', 'init');
    expect(ws.git('rev-parse', 'HEAD')).toMatch(/^[0-9a-f]{40}$/);
  });
});
