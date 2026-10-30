import * as fs from 'fs';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveAsset } from '../../src/main/storyboards/assets';
import { StoryboardService } from '../../src/main/storyboards/StoryboardService';
import { DEFAULT_STORYBOARDS_CONFIG } from '../../src/shared/types/storyboards';
import { createStoryboardWorkspace, type StoryboardWorkspace } from '../fixtures/storyboards';

// fs as a pass-through mock, so single lstat answers can be changed below.
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, default: actual };
});

/**
 * Creating file symlinks needs a privilege on Windows (Developer Mode), so the real-symlink cases in
 * StoryboardService.scan.test.ts and storyboardAssets.test.ts are skipped there. These cases make
 * lstat report a symbolic link for one file, which exercises the same refusal on every OS.
 */
function reportAsSymlink(fileName: string) {
  const real = fs.lstatSync;
  vi.spyOn(fs, 'lstatSync').mockImplementation(((p: fs.PathLike, opts?: fs.StatSyncOptions) => {
    const stats = real(p, opts as fs.StatSyncOptions) as fs.Stats;
    if (path.basename(String(p)) !== fileName) return stats;
    return Object.assign(Object.create(Object.getPrototypeOf(stats)), stats, { isSymbolicLink: () => true, isFile: () => false });
  }) as typeof fs.lstatSync);
}

function service(ws: StoryboardWorkspace) {
  return new StoryboardService({ workspaceRoot: ws.root, kbPath: path.join(ws.root, 'oms-knowledge-base'), config: DEFAULT_STORYBOARDS_CONFIG });
}

describe('symlinked files (simulated through lstat)', () => {
  let ws: StoryboardWorkspace;
  afterEach(() => {
    vi.restoreAllMocks();
    ws?.cleanup();
  });

  it('a symlinked story.md is a scan error and the storyboard is not listed', () => {
    ws = createStoryboardWorkspace();
    ws.writeExample();
    ws.writeExample({ id: 'other', domain: 'fx', title: 'Other' });
    reportAsSymlink('story.md');
    const result = service(ws).scan();
    expect(result.catalogue).toEqual([]);
    expect(result.errors.map((e) => e.code)).toEqual(['symlink', 'symlink']);
  });

  it('a symlinked asset file is refused', () => {
    ws = createStoryboardWorkspace();
    ws.writeExample();
    const svc = service(ws);
    svc.scan();
    expect(resolveAsset(svc, 'buy-gold-mobile', 'accept-quote.excalidraw.svg').status).toBe(200);
    reportAsSymlink('accept-quote.excalidraw.svg');
    expect(resolveAsset(svc, 'buy-gold-mobile', 'accept-quote.excalidraw.svg').status).toBe(404);
  });

  it('a symlinked step file is unreadable, and its illustration counts as missing', () => {
    ws = createStoryboardWorkspace();
    ws.writeExample();
    const svc = service(ws);
    svc.scan();
    reportAsSymlink('accept-quote.md');
    const d = svc.detail('buy-gold-mobile');
    if (!d.ok) throw new Error(d.message);
    expect(d.detail.steps[1]).toMatchObject({ id: 'accept-quote', readable: false, unreadableReason: 'the file is a symbolic link' });
    expect(d.detail.problems).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'step-unreadable', stepId: 'accept-quote' })]));
  });
});
