import * as fs from 'fs';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { StoryboardService } from '../../src/main/storyboards/StoryboardService';
import { WatcherService } from '../../src/main/services/WatcherService';
import type { WebSocketServer } from '../../src/main/websocket/server';
import type { CockpitEvent } from '../../src/shared/types/events';
import { DEFAULT_STORYBOARDS_CONFIG } from '../../src/shared/types/storyboards';
import { createStoryboardWorkspace, type StoryboardWorkspace } from '../fixtures/storyboards';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ID = 'buy-gold-mobile';

function setup() {
  const ws = createStoryboardWorkspace();
  const dir = ws.writeExample();
  const events: CockpitEvent[] = [];
  const svc = new StoryboardService({
    workspaceRoot: ws.root,
    kbPath: path.join(ws.root, 'oms-knowledge-base'),
    config: DEFAULT_STORYBOARDS_CONFIG,
    broadcast: (e) => events.push(e),
    debounceMs: 50,
  });
  svc.scan();
  return { ws, dir, svc, events };
}

const changed = (events: CockpitEvent[]) => events.filter((e) => e.type === 'storyboards:changed');

describe('StoryboardService change notifications', () => {
  let ws: StoryboardWorkspace;
  afterEach(() => ws?.cleanup());

  it('suppresses the echo of its own write', async () => {
    let svc: StoryboardService;
    let dir: string;
    let events: CockpitEvent[];
    ({ ws, svc, dir, events } = setup());
    const d = svc.detail(ID);
    if (!d.ok) throw new Error(d.message);
    const s = d.detail.steps[0];
    svc.saveStep(ID, s.id, { title: 'Mine' }, s.body, s.revision);
    svc.onWatcherPath(path.join(ws.root, dir, 'steps', `${s.id}.md`), 'change');
    await sleep(150);
    expect(changed(events)).toEqual([]);
  });

  it('broadcasts one debounced storyboards:changed for a burst of external edits, after rescanning', async () => {
    let svc: StoryboardService;
    let dir: string;
    let events: CockpitEvent[];
    ({ ws, svc, dir, events } = setup());
    const file = path.join(ws.root, dir, 'story.md');
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/title: .*/, `title: External ${i}`));
      svc.onWatcherPath(file, 'change');
    }
    await sleep(200);
    expect(changed(events)).toHaveLength(1);
    expect(changed(events)[0].payload).toEqual({ reason: 'external' });
    expect(svc.scan().catalogue[0].title).toBe('External 4');
  });

  it('broadcasts when a new storyboard folder appears, and ignores paths outside the roots', async () => {
    let svc: StoryboardService;
    let events: CockpitEvent[];
    ({ ws, svc, events } = setup());
    svc.onWatcherPath(path.join(ws.root, 'oms-core', 'src', 'Foo.java'), 'change');
    await sleep(120);
    expect(changed(events)).toEqual([]);
    ws.writeExample({ id: 'second', domain: 'fx', title: 'Second' });
    svc.onWatcherPath(path.join(ws.storyboards, 'fx', 'second', 'story.md'), 'add');
    await sleep(120);
    expect(changed(events)).toHaveLength(1);
    expect(svc.entry('second')).toBeDefined();
  });

  it('does not echo its own deletes', async () => {
    let svc: StoryboardService;
    let dir: string;
    let events: CockpitEvent[];
    ({ ws, svc, dir, events } = setup());
    const d = svc.detail(ID);
    if (!d.ok) throw new Error(d.message);
    svc.deleteStep(ID, 'accept-quote', true, d.detail.revision);
    svc.onWatcherPath(path.join(ws.root, dir, 'steps', 'accept-quote.md'), 'unlink');
    svc.onWatcherPath(path.join(ws.root, dir, 'assets', 'accept-quote.excalidraw.svg'), 'unlink');
    svc.onWatcherPath(path.join(ws.root, dir, 'story.md'), 'change');
    await sleep(120);
    expect(changed(events)).toEqual([]);
  });

  it('reconfigure clears the catalogue, rescans with the new config and broadcasts', () => {
    let svc: StoryboardService;
    let events: CockpitEvent[];
    ({ ws, svc, events } = setup());
    ws.writeExample({ id: 'elsewhere', domain: 'd', root: 'docs/storyboards' });
    const result = svc.reconfigure({ ...DEFAULT_STORYBOARDS_CONFIG, roots: ['docs/storyboards'], writable: false });
    expect(result.catalogue.map((s) => s.id)).toEqual(['elsewhere']);
    expect(result.writable).toBe(false);
    expect(svc.entry(ID)).toBeUndefined();
    expect(changed(events).map((e) => e.payload)).toEqual([{ reason: 'config' }]);
  });
});

describe('WatcherService path listeners', () => {
  let ws: StoryboardWorkspace;
  let watcher: WatcherService | null = null;
  afterEach(() => {
    watcher?.stop();
    ws?.cleanup();
  });

  it('passes every change under the watched folders to onPath listeners', async () => {
    ws = createStoryboardWorkspace();
    const dir = ws.writeExample();
    const seen: string[] = [];
    watcher = new WatcherService(ws.root, { broadcast: () => undefined } as unknown as WebSocketServer);
    const off = watcher.onPath((p) => seen.push(p));
    watcher.start();
    await sleep(1000);
    const file = path.join(ws.root, dir, 'story.md');
    fs.appendFileSync(file, '\nMore.\n');
    const start = Date.now();
    while (!seen.includes(file) && Date.now() - start < 3000) await sleep(25);
    expect(seen).toContain(file);
    off();
    const count = seen.length;
    fs.appendFileSync(file, '\nEven more.\n');
    await sleep(600);
    expect(seen.length).toBe(count);
  });
});
