import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ApiHistoryService, HISTORY_FILE, MAX_BODY_CHARS, MAX_ENTRIES } from '../../src/main/services/ApiHistoryService';

const command = (n: number) => ({
  kind: 'command' as const,
  label: 'OrderAcceptCmd',
  method: 'POST' as const,
  path: '/api/command/execute',
  status: 200,
  durationMs: n,
  request: { body: `{"n":${n}}` },
});

describe('ApiHistoryService', () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
  const tmp = () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-history-'));
    dirs.push(d);
    return d;
  };

  it('keeps the newest 100 across instances', () => {
    expect(MAX_ENTRIES).toBe(100);
    const dir = tmp();
    const first = new ApiHistoryService(dir);
    for (let n = 1; n <= 105; n++) first.add(command(n));
    // A new instance on the same directory is what a restart looks like.
    const entries = new ApiHistoryService(dir).list();
    expect(entries).toHaveLength(100);
    expect(entries[0].durationMs).toBe(105);
    expect(entries[99].durationMs).toBe(6);
    expect(entries[0]).toMatchObject({ kind: 'command', label: 'OrderAcceptCmd', status: 200, request: { body: '{"n":105}' } });
    expect(entries[0].id).toBeTruthy();
    expect(new Date(entries[0].at).toString()).not.toBe('Invalid Date');
    expect(new Set(entries.map((e) => e.id)).size).toBe(100);
  });

  it('records queries with their filters', () => {
    const service = new ApiHistoryService(tmp());
    service.add({
      kind: 'query',
      label: 'search',
      method: 'GET',
      path: '/api/query/search?symbol=AAPL',
      status: null,
      durationMs: 3,
      request: { params: [{ field: 'symbol', op: 'eq', value: 'AAPL' }], page: 0, size: 50 },
    });
    expect(service.list()[0]).toMatchObject({ status: null, request: { params: [{ field: 'symbol' }], size: 50 } });
  });

  it('clear empties the file', () => {
    const dir = tmp();
    const service = new ApiHistoryService(dir);
    service.add(command(1));
    service.clear();
    expect(service.list()).toEqual([]);
    expect(JSON.parse(fs.readFileSync(path.join(dir, HISTORY_FILE), 'utf-8'))).toEqual([]);
  });

  it('corrupt file reads as empty and is replaced by the next add', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, HISTORY_FILE), '{not json');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const service = new ApiHistoryService(dir);
    expect(service.list()).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    service.add(command(1));
    expect(new ApiHistoryService(dir).list()).toHaveLength(1);
    warn.mockRestore();
  });

  it('truncates large bodies', () => {
    const service = new ApiHistoryService(tmp());
    service.add({ ...command(1), request: { body: 'x'.repeat(MAX_BODY_CHARS + 10) } });
    const request = service.list()[0].request as { body: string; truncated?: boolean };
    expect(request.body).toHaveLength(MAX_BODY_CHARS);
    expect(request.truncated).toBe(true);
  });

  it('writes atomically, leaving no temp file behind', () => {
    const dir = tmp();
    new ApiHistoryService(dir).add(command(1));
    expect(fs.readdirSync(dir)).toEqual([HISTORY_FILE]);
  });
});
