import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ApiTemplateService } from '../../src/main/services/ApiTemplateService';
import { parseHttpFile } from '../../src/shared/httpFile';

const BODY = '{\n  "owner": "{{owner}}"\n}';

describe('ApiTemplateService', () => {
  const dirs: string[] = [];
  afterEach(() => {
    dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
    vi.restoreAllMocks();
  });

  function workspace(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-templates-'));
    dirs.push(root);
    fs.mkdirSync(path.join(root, 'requests'), { recursive: true });
    fs.writeFileSync(path.join(root, 'requests', 'shop.http'), '@baseUrl = http://h\n\n###\n# @name one\nPOST {{baseUrl}}/baskets\n\n{"owner":"ann"}\n');
    fs.mkdirSync(path.join(root, 'service'));
    fs.writeFileSync(path.join(root, 'service', 'rest.http'), 'GET http://h/x\r\n');
    return root;
  }

  const service = (root: string, sources = ['requests/shop.http', 'service/rest.http']) => new ApiTemplateService(root, sources);

  it('lists the configured sources and marks a missing one', () => {
    const root = workspace();
    const outside = path.join(root, '..', `${path.basename(root)}-outside.http`);
    fs.writeFileSync(outside, 'GET http://h/y');
    dirs.push(outside);
    const list = service(root, ['requests/shop.http', 'nope/missing.http', outside, ' ']).list();
    expect(list.map((s) => [s.path, Boolean(s.missing)])).toEqual([
      ['requests/shop.http', false],
      ['nope/missing.http', true],
      [outside.replace(/\\/g, '/'), false],
    ]);
    expect(list[0].file?.requests[0].name).toBe('one');
    expect(list[1].file).toBeUndefined();
  });

  it('appends a template block without changing existing bytes', () => {
    const root = workspace();
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    const s = service(root);
    for (const rel of ['requests/shop.http', 'service/rest.http']) {
      const file = path.join(root, rel);
      const before = fs.readFileSync(file);
      expect(s.save({ path: rel, name: 'Basket for ann', method: 'post', url: '{{baseUrl}}/baskets', body: BODY })).toEqual({ ok: true, path: rel });
      const after = fs.readFileSync(file);
      expect(after.subarray(0, before.length).equals(before), rel).toBe(true);
      const t = parseHttpFile(after.toString('utf8')).requests.find((r) => r.name === 'Basket for ann');
      expect(t, rel).toMatchObject({ method: 'POST', url: '{{baseUrl}}/baskets', body: BODY });
    }
    // a CRLF file gets a CRLF block
    expect(fs.readFileSync(path.join(root, 'service', 'rest.http'), 'utf8')).not.toMatch(/[^\r]\n/);
    expect(log).toHaveBeenCalledWith('[api-explorer] template saved Basket for ann → service/rest.http');

    const created = s.save({ newFile: 'mine.http', name: 'Mine', method: 'GET', url: 'http://h/baskets', body: '' });
    expect(created).toEqual({ ok: true, path: 'requests/mine.http' });
    const parsed = parseHttpFile(fs.readFileSync(path.join(root, 'requests', 'mine.http'), 'utf8'));
    expect(parsed.requests).toMatchObject([{ name: 'Mine', method: 'GET', url: 'http://h/baskets', body: null }]);
  });

  it('refuses a duplicate name, an unknown path, bad input and an existing new file', () => {
    const root = workspace();
    const s = service(root);
    const dir = path.join(root, 'requests');
    const snapshot = () => fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('|');
    const before = snapshot();
    const req = { method: 'POST', url: 'http://h/baskets', body: BODY };

    expect(s.save({ path: 'requests/shop.http', name: ' one ', ...req })).toEqual({ ok: false, error: 'A template named "one" already exists in requests/shop.http' });
    // the name an unnamed block is listed under counts too
    expect(s.save({ path: 'service/rest.http', name: 'GET http://h/x', ...req }).ok).toBe(false);
    expect(s.save({ path: '../outside.http', name: 'x', ...req })).toEqual({ ok: false, error: 'Not a template source: ../outside.http' });
    expect(s.save({ path: 'nope/missing.http', name: 'x', ...req }).ok).toBe(false);
    expect(s.save({ newFile: 'shop.http', name: 'x', ...req })).toEqual({ ok: false, error: 'requests/shop.http already exists' });
    expect(s.save({ newFile: '../evil.http', name: 'x', ...req })).toEqual({ ok: false, error: 'File name must look like name.http' });
    expect(s.save({ newFile: 'x.txt', name: 'x', ...req }).ok).toBe(false);
    expect(s.save({ path: 'requests/shop.http', name: '', ...req })).toEqual({ ok: false, error: 'Template name must be 1–80 characters on one line' });
    expect(s.save({ path: 'requests/shop.http', name: 'a\nb', ...req }).ok).toBe(false);
    expect(s.save({ path: 'requests/shop.http', name: 'x'.repeat(81), ...req }).ok).toBe(false);
    expect(s.save({ path: 'requests/shop.http', name: 'x', ...req, method: 'BREW' })).toEqual({ ok: false, error: 'Unsupported method BREW' });
    expect(s.save({ path: 'requests/shop.http', name: 'x', ...req, url: 'http://h/a b' }).ok).toBe(false);
    expect(snapshot()).toBe(before);
  });

  it('a new file needs a configured source to go next to', () => {
    const root = workspace();
    expect(service(root, []).save({ newFile: 'mine.http', name: 'Mine', method: 'GET', url: 'http://h/', body: '' })).toEqual({
      ok: false,
      error: 'List a template file under apiExplorer.templateSources in cockpit.yaml first',
    });
  });
});
