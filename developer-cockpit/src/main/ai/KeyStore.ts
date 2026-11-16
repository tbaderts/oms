import * as fs from 'fs';
import * as path from 'path';
import { AI_PROVIDERS, type AiKeySetResult, type AiProviderId } from '../../shared/types/ai';

/** The encryption seam: Electron safeStorage in production, a reversible fake in tests. */
export interface KeyCrypto {
  isAvailable(): boolean;
  encrypt(plain: string): Buffer;
  decrypt(cipher: Buffer): string;
}

/** The part of Electron's `safeStorage` the store uses (typed here so tests never import electron). */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  getSelectedStorageBackend?(): string;
  encryptString(plain: string): Buffer;
  decryptString(cipher: Buffer): string;
}

/**
 * Electron safeStorage as a KeyCrypto: DPAPI on Windows, Keychain on macOS, the secret service on
 * Linux. Linux's `basic_text` backend is plain-text equivalent, so it counts as unavailable (D7).
 */
export function electronKeyCrypto(safeStorage: SafeStorageLike, platform: NodeJS.Platform = process.platform): KeyCrypto {
  return {
    isAvailable: () => {
      if (!safeStorage.isEncryptionAvailable()) return false;
      if (platform === 'linux' && safeStorage.getSelectedStorageBackend?.() === 'basic_text') return false;
      return true;
    },
    encrypt: (plain) => safeStorage.encryptString(plain),
    decrypt: (cipher) => safeStorage.decryptString(cipher),
  };
}

const KEY_FILE = 'ai-keys.json';
const MAX_KEY_LENGTH = 4096;

interface KeyFile {
  version: 1;
  keys: Partial<Record<AiProviderId, string>>;
}

/**
 * AI provider keys, one per provider, encrypted at rest (SPEC-0063). The file holds only
 * ciphertext (base64); a key is decrypted only when a provider call needs it. Nothing here throws,
 * and no message or log line ever contains a key.
 */
export class KeyStore {
  private readonly file: string;

  constructor(private readonly dir: string, private readonly crypto: KeyCrypto, private readonly log: (msg: string) => void = console.warn) {
    this.file = path.join(dir, KEY_FILE);
  }

  isAvailable(): boolean {
    try {
      return this.crypto.isAvailable();
    } catch {
      return false;
    }
  }

  has(provider: AiProviderId): boolean {
    return Boolean(this.read()?.keys[provider]);
  }

  /** The decrypted key, or undefined when none is saved or it cannot be decrypted here. */
  get(provider: AiProviderId): string | undefined {
    const cipher = this.read()?.keys[provider];
    if (!cipher) return undefined;
    try {
      return this.crypto.decrypt(Buffer.from(cipher, 'base64'));
    } catch {
      this.log(`[keys] could not decrypt the ${provider} key (saved on another machine or account?); set it again in Settings → AI`);
      return undefined;
    }
  }

  set(provider: AiProviderId, key: string): AiKeySetResult {
    if (!AI_PROVIDERS.includes(provider)) return { ok: false, code: 'invalid', message: 'Unknown provider.' };
    const value = typeof key === 'string' ? key.trim() : '';
    if (!value || value.length > MAX_KEY_LENGTH || /[\r\n]/.test(value)) {
      return { ok: false, code: 'invalid', message: `The key must be 1–${MAX_KEY_LENGTH} characters on one line.` };
    }
    if (!this.isAvailable()) {
      return { ok: false, code: 'encryption-unavailable', message: 'OS encryption is unavailable, so the key cannot be stored safely. Use the environment variable instead.' };
    }
    let cipher: string;
    try {
      cipher = this.crypto.encrypt(value).toString('base64');
    } catch {
      return { ok: false, code: 'encryption-unavailable', message: 'The key could not be encrypted. Use the environment variable instead.' };
    }
    const data = this.read();
    if (!data) return STORAGE_FAILED;
    data.keys[provider] = cipher;
    return this.write(data) ? { ok: true } : STORAGE_FAILED;
  }

  clear(provider: AiProviderId): AiKeySetResult {
    if (!AI_PROVIDERS.includes(provider)) return { ok: false, code: 'invalid', message: 'Unknown provider.' };
    const data = this.read();
    if (!data) return STORAGE_FAILED;
    if (!data.keys[provider]) return { ok: true };
    delete data.keys[provider];
    return this.write(data) ? { ok: true } : STORAGE_FAILED;
  }

  /**
   * The key file, or null when it exists but cannot be read or parsed. A missing file is an empty
   * store; an unreadable one is never treated as empty, so a later write cannot silently drop the
   * other providers' keys (review finding 5).
   */
  private read(): KeyFile | null {
    let raw: string;
    try {
      raw = fs.readFileSync(this.file, 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, keys: {} };
      this.log(`[keys] the key file could not be read (${(err as NodeJS.ErrnoException).code ?? 'error'}); keys are left untouched`);
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<KeyFile>;
      const keys: KeyFile['keys'] = {};
      for (const p of AI_PROVIDERS) {
        const v = parsed.keys?.[p];
        if (typeof v === 'string' && v) keys[p] = v;
      }
      return { version: 1, keys };
    } catch {
      this.log('[keys] the key file could not be read (not valid JSON); keys are left untouched');
      return null;
    }
  }

  /** Atomic write (temp file + rename), owner-only where the OS supports it. Never throws (review finding 2). */
  private write(data: KeyFile): boolean {
    const tmp = `${this.file}.${process.pid}.tmp`;
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf-8', mode: 0o600 });
      fs.renameSync(tmp, this.file);
      return true;
    } catch (err) {
      this.log(`[keys] the key file could not be written (${(err as NodeJS.ErrnoException).code ?? 'error'}); nothing was changed`);
      try {
        if (fs.statSync(tmp).isFile()) fs.rmSync(tmp, { force: true });
      } catch {
        // no temp file left behind (or it is not ours to remove)
      }
      return false;
    }
  }
}

const STORAGE_FAILED: AiKeySetResult = {
  ok: false,
  code: 'storage-failed',
  message: 'The key file could not be read or written, so nothing was changed. See the log for details.',
};
