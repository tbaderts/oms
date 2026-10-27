import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';
import WebSocket from 'ws';
import { WebSocketServer } from '../../src/main/websocket/server';
import { COCKPIT_ROOT, createWorkspace, proposalDoc, ticketMeta, type Workspace } from '../fixtures/workspace';

const SRC = path.join(COCKPIT_ROOT, 'src');

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sourceFiles(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []);
}

describe('workflow actions are not reachable over the WebSocket', () => {
  let ws: Workspace;
  let server: WebSocketServer | null = null;
  afterEach(() => {
    server?.stop();
    ws?.cleanup();
  });

  it('ws messages cannot trigger actions', async () => {
    ws = createWorkspace();
    ws.writeTicket('changes/SPEC-0001-a', ticketMeta('SPEC-0001', { awaiting: 'proposal' }), { proposal: proposalDoc(1) });
    const before = ws.readTicket('changes/SPEC-0001-a');
    const proposalFile = path.join(ws.root, 'specs/changes/SPEC-0001-a/proposal.md');
    const proposalBefore = fs.readFileSync(proposalFile, 'utf8');

    const port = await freePort();
    server = new WebSocketServer(port);
    server.start();
    const client = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve, reject) => {
      client.once('open', () => resolve());
      client.once('error', reject);
    });
    for (const msg of [
      { type: 'specTickets:run', payload: { kind: 'approve', id: 'SPEC-0001' } },
      { type: 'specTickets:run', payload: { kind: 'advance', id: 'SPEC-0001' } },
      { channel: 'specTickets:run', args: [{ kind: 'note', id: 'SPEC-0001', text: 'injected' }] },
      { channel: 'specTickets:saveDocument', args: ['SPEC-0001', 'proposal', 'injected', proposalBefore, true] },
      { type: 'specTickets:toggleTask', payload: { id: 'SPEC-0001', taskId: 'T-1', done: true } },
    ]) client.send(JSON.stringify(msg));
    client.send('not json at all');
    await new Promise((r) => setTimeout(r, 500));
    client.close();

    expect(ws.readTicket('changes/SPEC-0001-a')).toBe(before);
    expect(fs.readFileSync(proposalFile, 'utf8')).toBe(proposalBefore);
  });

  it('document writes are exposed only as renderer IPC channels', () => {
    const ipc = fs.readFileSync(path.join(SRC, 'main', 'ipc', 'specTickets.ipc.ts'), 'utf8');
    for (const channel of ['specTickets:saveDocument', 'specTickets:draftGate', 'specTickets:toggleTask']) {
      expect(ipc).toMatch(new RegExp(`ipcMain\\.handle\\(\\s*'${channel}'`));
    }
    const server = fs.readFileSync(path.join(SRC, 'main', 'websocket', 'server.ts'), 'utf8');
    expect(server).not.toMatch(/saveDocument|toggleTask|draftGate/);
  });

  it('only specTickets.ipc imports SpecTicketsService', () => {
    const importers = sourceFiles(SRC)
      .filter((f) => !f.endsWith(`${path.sep}SpecTicketsService.ts`))
      .filter((f) => /from\s+['"][^'"]*SpecTicketsService['"]/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(SRC, f).replace(/\\/g, '/'));
    expect(importers).toEqual(['main/ipc/specTickets.ipc.ts']);

    const server = fs.readFileSync(path.join(SRC, 'main', 'websocket', 'server.ts'), 'utf8');
    expect(server).not.toMatch(/\.on\(\s*['"]message['"]/);
  });
});
