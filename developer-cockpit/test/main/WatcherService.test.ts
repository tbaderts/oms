import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { WatcherService } from '../../src/main/services/WatcherService';
import type { WebSocketServer } from '../../src/main/websocket/server';
import type { CockpitEvent } from '../../src/shared/types/events';
import { createWorkspace, ticketMeta, type Workspace } from '../fixtures/workspace';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function ticketEvents(events: CockpitEvent[]): CockpitEvent[] {
  return events.filter((e) => e.type === 'specs:tickets-changed');
}

async function waitFor(events: CockpitEvent[], count: number, timeoutMs: number): Promise<number> {
  const start = Date.now();
  while (ticketEvents(events).length < count) {
    if (Date.now() - start > timeoutMs) throw new Error(`no specs:tickets-changed within ${timeoutMs}ms`);
    await sleep(25);
  }
  return Date.now() - start;
}

describe('WatcherService', () => {
  let ws: Workspace;
  let watcher: WatcherService | null = null;
  afterEach(() => {
    watcher?.stop();
    ws?.cleanup();
  });

  it('broadcasts specs:tickets-changed within 2s of a ticket change', async () => {
    ws = createWorkspace();
    const events: CockpitEvent[] = [];
    const broadcaster = { broadcast: (e: CockpitEvent) => events.push(e) } as unknown as WebSocketServer;
    watcher = new WatcherService(ws.root, broadcaster);
    watcher.start();
    await sleep(1000); // let chokidar finish its initial scan

    const dir = ws.writeTicket('changes/SPEC-0001-a', ticketMeta('SPEC-0001'));
    expect(await waitFor(events, 1, 2000)).toBeLessThan(2000);
    expect(ticketEvents(events)[0].payload).toHaveProperty('path');

    const file = path.join(dir, 'ticket.md');
    for (let i = 0; i < 10; i++) fs.appendFileSync(file, `- line ${i}\n`);
    expect(await waitFor(events, 2, 2000)).toBeLessThan(2000);
    await sleep(800);
    expect(ticketEvents(events)).toHaveLength(2); // the burst coalesced into one event

    fs.rmSync(file);
    expect(await waitFor(events, 3, 2000)).toBeLessThan(2000);
  });

  it('watches oms-contracts/src/main', async () => {
    ws = createWorkspace();
    const contract = path.join(ws.root, 'oms-contracts', 'src', 'main', 'openapi', 'oms-cmd-api.yml');
    fs.mkdirSync(path.dirname(contract), { recursive: true });
    fs.writeFileSync(contract, 'openapi: 3.0.3\n');
    const events: CockpitEvent[] = [];
    const broadcaster = { broadcast: (e: CockpitEvent) => events.push(e) } as unknown as WebSocketServer;
    watcher = new WatcherService(ws.root, broadcaster);
    watcher.start();
    await sleep(1000);

    fs.appendFileSync(contract, 'info: {}\n');
    const start = Date.now();
    const changed = () => events.find((e) => e.type === 'file:changed' && (e.payload as { path: string }).path === contract);
    while (!changed() && Date.now() - start < 3000) await sleep(25);
    expect(changed()).toBeDefined();
  });

  it('watches api-templates and the extra template paths', async () => {
    ws = createWorkspace();
    const shared = path.join(ws.root, 'developer-cockpit', 'api-templates', 'orders.http');
    const extraA = path.join(ws.root, 'oms-core', 'rest.http');
    const extraB = path.join(ws.root, 'other.http');
    for (const f of [shared, extraA, extraB]) {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, '###\n');
    }
    const events: CockpitEvent[] = [];
    const broadcaster = { broadcast: (e: CockpitEvent) => events.push(e) } as unknown as WebSocketServer;
    watcher = new WatcherService(ws.root, broadcaster);
    watcher.setExtraPaths([extraA]); // before start: applied on start
    watcher.start();
    await sleep(1000);

    const changed = async (file: string) => {
      events.length = 0;
      fs.appendFileSync(file, '# x\n');
      const start = Date.now();
      const hit = () => events.some((e) => e.type === 'file:changed' && (e.payload as { path: string }).path === file);
      while (!hit() && Date.now() - start < 2000) await sleep(25);
      return hit();
    };
    expect(await changed(shared)).toBe(true);
    expect(await changed(extraA)).toBe(true);
    expect(await changed(extraB)).toBe(false);

    watcher.setExtraPaths([extraB]);
    await sleep(500);
    expect(await changed(extraB)).toBe(true);
    expect(await changed(extraA)).toBe(false);
  });
});
