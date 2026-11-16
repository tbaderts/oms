import * as fs from 'fs';
import * as path from 'path';
import type { KeyCrypto } from '../../src/main/ai/KeyStore';

/**
 * A reversible stand-in for Electron safeStorage: reverses the string and prefixes a marker, so a
 * stored key never appears in plain text in any file, and tests never depend on the OS.
 */
export function fakeCrypto(opts: { available?: boolean } = {}): KeyCrypto {
  return {
    isAvailable: () => opts.available ?? true,
    encrypt: (s) => Buffer.from(`enc:${[...s].reverse().join('')}`, 'utf-8'),
    decrypt: (b) => {
      const s = b.toString('utf-8');
      if (!s.startsWith('enc:')) throw new Error('not ciphertext');
      return [...s.slice(4)].reverse().join('');
    },
  };
}

/** The text of every file in a directory (recursively), to assert a secret appears in none. */
export function allFileText(dir: string): string {
  if (!fs.existsSync(dir)) return '';
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .map((e) => (e.isDirectory() ? allFileText(path.join(dir, e.name)) : fs.readFileSync(path.join(dir, e.name), 'utf-8')))
    .join('\n');
}
