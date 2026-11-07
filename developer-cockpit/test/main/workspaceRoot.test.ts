import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { detectWorkspaceRoot } from '../../src/main/services/ConfigService';
import { expandRoots, safeRealpath } from '../../src/main/storyboards/roots';

const dirs: string[] = [];
const tmp = (prefix: string): string => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

describe('expandRoots', () => {
  it('resolves an existing root against the workspace', () => {
    const ws = tmp('cockpit-ws-');
    fs.mkdirSync(path.join(ws, 'oms-knowledge-base', 'storyboards'), { recursive: true });
    const { roots, missing } = expandRoots(ws, ['oms-knowledge-base/storyboards']);
    expect(missing).toEqual([]);
    expect(roots.map((r) => r.dir)).toEqual([fs.realpathSync(path.join(ws, 'oms-knowledge-base', 'storyboards'))]);
    expect(roots[0].label).toBe('oms-knowledge-base/storyboards');
  });

  it('an unresolvable (foreign-platform) root degrades to no roots instead of throwing', () => {
    // Regression: a saved `C:\…` path on POSIX used to throw ENOENT during startup and take the
    // whole main process down before the window opened.
    const r = expandRoots('C:\\data\\workspace\\oms', ['oms-knowledge-base/storyboards']);
    expect(r.roots).toEqual([]);
    expect(r.missing).toEqual(['oms-knowledge-base/storyboards']);
  });

  it('an empty root resolves to no roots', () => {
    const r = expandRoots('', ['oms-knowledge-base/storyboards']);
    expect(r.roots).toEqual([]);
    expect(r.missing).toEqual(['oms-knowledge-base/storyboards']);
  });

  it('reports patterns that match no existing folder as missing', () => {
    const ws = tmp('cockpit-ws-');
    fs.mkdirSync(path.join(ws, 'oms-knowledge-base', 'storyboards'), { recursive: true });
    const { roots, missing } = expandRoots(ws, ['nope/here', 'oms-knowledge-base/storyboards']);
    expect(missing).toEqual(['nope/here']);
    expect(roots).toHaveLength(1);
  });
});

describe('detectWorkspaceRoot', () => {
  it('finds the nearest ancestor that has a .git directory', () => {
    const ws = tmp('cockpit-git-');
    fs.mkdirSync(path.join(ws, 'sub', 'deeper'), { recursive: true });
    fs.mkdirSync(path.join(ws, '.git'));
    const inner = path.join(ws, 'sub', 'deeper');
    expect(detectWorkspaceRoot(inner)).toBe(fs.realpathSync(ws));
  });

  it('recognises a .git file (worktrees, submodules), not only a directory', () => {
    const ws = tmp('cockpit-git-');
    fs.mkdirSync(path.join(ws, 'sub'));
    fs.writeFileSync(path.join(ws, '.git'), 'gitdir: /somewhere/.git/worktrees/x\n');
    expect(detectWorkspaceRoot(path.join(ws, 'sub'))).toBe(fs.realpathSync(ws));
  });

  it('returns null when no ancestor is a repository', () => {
    const ws = tmp('cockpit-nogit-');
    fs.mkdirSync(path.join(ws, 'a', 'b'), { recursive: true });
    // Guard against running inside a repo (e.g. CI checkout) by walking up from a temp dir.
    const probe = detectWorkspaceRoot(path.join(ws, 'a', 'b'));
    if (fs.existsSync(path.join(os.tmpdir(), '.git'))) {
      expect(probe).not.toBe(null);
    } else {
      expect(probe).toBe(null);
    }
  });

  it('safeRealpath returns the input unchanged when it cannot be resolved', () => {
    expect(safeRealpath('C:\\data\\workspace\\oms')).toBe('C:\\data\\workspace\\oms');
    const ws = tmp('cockpit-ws-');
    expect(safeRealpath(ws)).toBe(fs.realpathSync(ws));
  });
});
