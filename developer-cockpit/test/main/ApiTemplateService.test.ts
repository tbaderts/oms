import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ApiTemplateService } from '../../src/main/services/ApiTemplateService';
import { parseHttpFile } from '../../src/shared/httpFile';

const BODY = '{\n  "type": "OrderAcceptCmd",\n  "orderId": "{{orderId}}"\n}';

describe('ApiTemplateService', () => {
  const dirs: string[] = [];
  afterEach(() => {
    dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
    vi.restoreAllMocks();
  });

  function workspace(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-templates-'));
    dirs.push(root);
    const shared = path.join(root, 'developer-cockpit', 'api-templates');
    fs.mkdirSync(shared, { recursive: true });
    fs.writeFileSync(path.join(shared, 'b.http'), '@baseUrl = http://h\n\n###\n# @name one\nPOST {{baseUrl}}/api/command/execute\n\n{"type":"OrderAcceptCmd"}\n');
    fs.writeFileSync(path.join(shared, 'a.http'), 'POST http://h/api/command/execute\n\n{}');
    fs.writeFileSync(path.join(shared, 'notes.md'), 'not a template');
    fs.mkdirSync(path.join(root, 'oms-core'));
    fs.writeFileSync(path.join(root, 'oms-core', 'rest.http'), 'GET http://h/x\r\n');
    return root;
  }

  const service = (root: string, extra: string[] = ['oms-core/rest.http']) => new ApiTemplateService(root, extra, () => 'http://localhost:8090');

  it('lists shared and extra sources and marks a missing one', () => {
    const root = workspace();
    const outside = path.join(root, '..', `${path.basename(root)}-outside.http`);
    fs.writeFileSync(outside, 'GET http://h/y');
    dirs.push(outside);
    const list = service(root, ['oms-core/rest.http', 'nope/missing.http', outside]).list();
    expect(list.map((s) => [s.path, s.shared, Boolean(s.missing)])).toEqual([
      ['developer-cockpit/api-templates/a.http', true, false],
      ['developer-cockpit/api-templates/b.http', true, false],
      ['oms-core/rest.http', false, false],
      ['nope/missing.http', false, true],
      [outside.replace(/\\/g, '/'), false, false],
    ]);
    expect(list[1].file?.requests[0].name).toBe('one');
    expect(list[3].file).toBeUndefined();

    // read on every call
    fs.writeFileSync(path.join(root, 'developer-cockpit', 'api-templates', 'c.http'), '');
    expect(service(root).list().map((s) => s.path)).toContain('developer-cockpit/api-templates/c.http');
  });

  it('lists the configured sources when the shared folder does not exist', () => {
    const root = workspace();
    fs.rmSync(path.join(root, 'developer-cockpit'), { recursive: true });
    expect(service(root).list().map((s) => s.path)).toEqual(['oms-core/rest.http']);
  });

  it('appends a template block without changing existing bytes', () => {
    const root = workspace();
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    const s = service(root);
    for (const [rel, declared] of [['developer-cockpit/api-templates/b.http', true], ['developer-cockpit/api-templates/a.http', false], ['oms-core/rest.http', false]] as const) {
      const file = path.join(root, rel);
      const before = fs.readFileSync(file);
      expect(s.save({ path: rel, name: 'Accept it', body: BODY })).toEqual({ ok: true, path: rel });
      const after = fs.readFileSync(file);
      expect(after.subarray(0, before.length).equals(before), rel).toBe(true);
      const t = parseHttpFile(after.toString('utf8')).requests.find((r) => r.name === 'Accept it');
      expect(t?.body, rel).toBe(BODY);
      expect(t?.url, rel).toBe(declared ? '{{baseUrl}}/api/command/execute' : 'http://localhost:8090/api/command/execute');
    }
    // a CRLF file gets a CRLF block
    expect(fs.readFileSync(path.join(root, 'oms-core', 'rest.http'), 'utf8')).not.toMatch(/[^\r]\n/);
    expect(log).toHaveBeenCalledWith('[api-explorer] template saved Accept it → oms-core/rest.http');

    const created = s.save({ newFile: 'mine.http', name: 'Mine', body: BODY });
    expect(created).toEqual({ ok: true, path: 'developer-cockpit/api-templates/mine.http' });
    const text = fs.readFileSync(path.join(root, 'developer-cockpit', 'api-templates', 'mine.http'), 'utf8');
    const parsed = parseHttpFile(text);
    expect(parsed.variables).toEqual({ baseUrl: 'http://localhost:8090' });
    expect(parsed.requests).toMatchObject([{ name: 'Mine', url: '{{baseUrl}}/api/command/execute', body: BODY }]);
  });

  it('refuses a duplicate name, an unknown path and an existing new file', () => {
    const root = workspace();
    const s = service(root);
    const shared = path.join(root, 'developer-cockpit', 'api-templates');
    const snapshot = () => fs.readdirSync(shared).map((f) => fs.readFileSync(path.join(shared, f), 'utf8')).join('|');
    const before = snapshot();

    expect(s.save({ path: 'developer-cockpit/api-templates/b.http', name: ' one ', body: BODY })).toEqual({ ok: false, error: 'A template named "one" already exists in developer-cockpit/api-templates/b.http' });
    // the fallback name of an unnamed block counts too
    fs.writeFileSync(path.join(root, 'oms-core', 'rest.http'), '# Accept it\nPOST http://h/api/command/execute\n\n{}');
    expect(s.save({ path: 'oms-core/rest.http', name: 'Accept it', body: BODY }).ok).toBe(false);
    expect(s.save({ path: '../outside.http', name: 'x', body: BODY })).toEqual({ ok: false, error: 'Not a template source: ../outside.http' });
    expect(s.save({ path: 'nope/missing.http', name: 'x', body: BODY }).ok).toBe(false);
    expect(s.save({ newFile: 'a.http', name: 'x', body: BODY })).toEqual({ ok: false, error: 'developer-cockpit/api-templates/a.http already exists' });
    expect(s.save({ newFile: '../evil.http', name: 'x', body: BODY })).toEqual({ ok: false, error: 'File name must look like name.http' });
    expect(s.save({ newFile: 'x.txt', name: 'x', body: BODY }).ok).toBe(false);
    expect(s.save({ path: 'developer-cockpit/api-templates/b.http', name: '', body: BODY })).toEqual({ ok: false, error: 'Template name must be 1–80 characters on one line' });
    expect(s.save({ path: 'developer-cockpit/api-templates/b.http', name: 'a\nb', body: BODY }).ok).toBe(false);
    expect(s.save({ path: 'developer-cockpit/api-templates/b.http', name: 'x'.repeat(81), body: BODY }).ok).toBe(false);
    expect(snapshot()).toBe(before);
    expect(fs.readFileSync(path.join(root, 'oms-core', 'rest.http'), 'utf8')).toBe('# Accept it\nPOST http://h/api/command/execute\n\n{}');

    // the `<type> #n` name an unnamed, uncommented block is listed under counts too
    const unnamed = 'POST http://h/api/command/execute\n\n{"type":"OrderAcceptCmd","orderId":"{{orderId}}"}\n';
    fs.writeFileSync(path.join(shared, 'b.http'), unnamed);
    expect(s.save({ path: 'developer-cockpit/api-templates/b.http', name: 'OrderAcceptCmd #1', body: BODY }).ok).toBe(false);
    expect(fs.readFileSync(path.join(shared, 'b.http'), 'utf8')).toBe(unnamed);
  });
});
