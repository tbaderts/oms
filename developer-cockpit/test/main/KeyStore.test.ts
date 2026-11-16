import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KeyStore, electronKeyCrypto } from '../../src/main/ai/KeyStore';
import { allFileText, fakeCrypto } from './keyTestUtils';

const ANTHROPIC = 'sk-ant-test-0123456789abcdef';
const LOCAL = 'vllm-local-key-42';

const dirs: string[] = [];
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-keys-'));
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

describe('KeyStore (SPEC-0063)', () => {
  it('stores keys encrypted, never in plain text (AC-1)', () => {
    const dir = tmp();
    const store = new KeyStore(dir, fakeCrypto(), () => {});
    expect(store.set('anthropic', `  ${ANTHROPIC}  `)).toEqual({ ok: true });
    expect(store.get('anthropic')).toBe(ANTHROPIC);
    expect(store.has('anthropic')).toBe(true);
    expect(allFileText(dir)).not.toContain(ANTHROPIC);

    const file = JSON.parse(fs.readFileSync(path.join(dir, 'ai-keys.json'), 'utf-8'));
    expect(file.version).toBe(1);
    expect(fakeCrypto().decrypt(Buffer.from(file.keys.anthropic, 'base64'))).toBe(ANTHROPIC);
    // a fresh instance reads the same file
    expect(new KeyStore(dir, fakeCrypto(), () => {}).get('anthropic')).toBe(ANTHROPIC);
  });

  it('keys are independent per provider (AC-2)', () => {
    const store = new KeyStore(tmp(), fakeCrypto(), () => {});
    store.set('anthropic', ANTHROPIC);
    store.set('local', LOCAL);
    expect(store.get('openai')).toBeUndefined();
    store.set('anthropic', 'sk-ant-replaced');
    expect(store.get('local')).toBe(LOCAL);
    store.clear('local');
    expect(store.get('anthropic')).toBe('sk-ant-replaced');
  });

  it('clear removes the key (AC-6)', () => {
    const dir = tmp();
    const store = new KeyStore(dir, fakeCrypto(), () => {});
    store.set('openai', 'sk-openai-1');
    expect(store.clear('openai')).toEqual({ ok: true });
    expect(store.has('openai')).toBe(false);
    expect(store.get('openai')).toBeUndefined();
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'ai-keys.json'), 'utf-8')).keys).toEqual({});
    expect(store.clear('openai')).toEqual({ ok: true }); // idempotent
  });

  it('refuses to save when encryption is unavailable (AC-8)', () => {
    const dir = tmp();
    const store = new KeyStore(dir, fakeCrypto({ available: false }), () => {});
    const res = store.set('anthropic', ANTHROPIC);
    expect(res).toMatchObject({ ok: false, code: 'encryption-unavailable' });
    expect(res.message).toMatch(/encryption/i);
    expect(fs.existsSync(path.join(dir, 'ai-keys.json'))).toBe(false);
    expect(allFileText(dir)).not.toContain(ANTHROPIC);
    expect(store.isAvailable()).toBe(false);
  });

  it('rejects invalid keys and never puts a key in a message or log', () => {
    const logs: string[] = [];
    const store = new KeyStore(tmp(), fakeCrypto(), (m) => logs.push(m));
    expect(store.set('anthropic', '   ')).toMatchObject({ ok: false, code: 'invalid' });
    expect(store.set('anthropic', 'a\nb')).toMatchObject({ ok: false, code: 'invalid' });
    expect(store.set('anthropic', 'x'.repeat(4097))).toMatchObject({ ok: false, code: 'invalid' });
    expect(store.set('bogus' as never, ANTHROPIC)).toMatchObject({ ok: false, code: 'invalid' });
    expect(logs.join('\n')).not.toContain(ANTHROPIC);
  });

  it('an entry that cannot be decrypted reads as missing and is logged without its value', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'ai-keys.json'), JSON.stringify({ version: 1, keys: { anthropic: Buffer.from('garbage').toString('base64') } }));
    const logs: string[] = [];
    const store = new KeyStore(dir, fakeCrypto(), (m) => logs.push(m));
    expect(store.get('anthropic')).toBeUndefined();
    expect(logs.some((l) => l.includes('[keys]') && l.includes('anthropic'))).toBe(true);
    expect(logs.join('\n')).not.toContain('garbage');
  });

  it('a corrupt key file is never overwritten: set and clear refuse (review finding 5)', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'ai-keys.json'), '{not json');
    const logs: string[] = [];
    const store = new KeyStore(dir, fakeCrypto(), (m) => logs.push(m));
    expect(store.has('anthropic')).toBe(false);
    expect(store.set('anthropic', ANTHROPIC)).toMatchObject({ ok: false, code: 'storage-failed' });
    expect(store.clear('local')).toMatchObject({ ok: false, code: 'storage-failed' });
    expect(fs.readFileSync(path.join(dir, 'ai-keys.json'), 'utf-8')).toBe('{not json'); // other keys, if any, survive
    expect(logs.some((l) => l.startsWith('[keys]') && /could not be read/.test(l))).toBe(true);
    expect(logs.join('\n')).not.toContain(ANTHROPIC);
  });

  it('an unreadable key file (not missing) is never overwritten', () => {
    const dir = tmp();
    fs.mkdirSync(path.join(dir, 'ai-keys.json')); // reading it fails with EISDIR, not ENOENT
    const store = new KeyStore(dir, fakeCrypto(), () => {});
    expect(store.set('anthropic', ANTHROPIC)).toMatchObject({ ok: false, code: 'storage-failed' });
    expect(fs.statSync(path.join(dir, 'ai-keys.json')).isDirectory()).toBe(true);
  });

  it('a write failure is a result, never a throw, and leaves the old file intact (review finding 2)', () => {
    const dir = tmp();
    const store = new KeyStore(dir, fakeCrypto(), () => {});
    store.set('local', 'vllm-local-key-42');
    const before = fs.readFileSync(path.join(dir, 'ai-keys.json'), 'utf-8');
    // A directory where the temp file goes makes the write itself fail (the key file stays valid).
    const blocker = path.join(dir, `ai-keys.json.${process.pid}.tmp`);
    fs.mkdirSync(blocker);
    expect(() => store.set('anthropic', ANTHROPIC)).not.toThrow();
    expect(store.set('anthropic', ANTHROPIC)).toMatchObject({ ok: false, code: 'storage-failed' });
    expect(store.clear('local')).toMatchObject({ ok: false, code: 'storage-failed' });
    fs.rmdirSync(blocker);
    expect(fs.readFileSync(path.join(dir, 'ai-keys.json'), 'utf-8')).toBe(before);
    expect(store.get('local')).toBe('vllm-local-key-42');
    expect(store.has('anthropic')).toBe(false);
  });

  it('electronKeyCrypto treats the Linux basic_text backend as unavailable (D7)', () => {
    const safeStorage = {
      isEncryptionAvailable: vi.fn(() => true),
      getSelectedStorageBackend: vi.fn(() => 'basic_text'),
      encryptString: vi.fn(),
      decryptString: vi.fn(),
    };
    expect(electronKeyCrypto(safeStorage, 'linux').isAvailable()).toBe(false);
    expect(electronKeyCrypto(safeStorage, 'win32').isAvailable()).toBe(true);
    safeStorage.isEncryptionAvailable.mockReturnValue(false);
    expect(electronKeyCrypto(safeStorage, 'win32').isAvailable()).toBe(false);
  });
});
