import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/** The page's Content-Security-Policy, directive name → sources. */
function csp(): Map<string, string[]> {
  const html = fs.readFileSync(path.resolve(__dirname, '../../src/renderer/index.html'), 'utf8');
  const content = /http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(html)?.[1];
  if (!content) throw new Error('no CSP meta tag in index.html');
  return new Map(
    content.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
      const [name, ...sources] = d.split(/\s+/);
      return [name, sources] as [string, string[]];
    }),
  );
}

describe('renderer CSP (SPEC-0036)', () => {
  it('connect-src allows only self and IPv4 loopback WebSockets', () => {
    const connectSrc = csp().get('connect-src');
    expect(connectSrc).toEqual(["'self'", 'ws://127.0.0.1:*']);
    for (const source of connectSrc!) {
      expect(source).not.toMatch(/localhost/);
      expect(source).not.toMatch(/^(ws:|wss:|\*)$|^wss?:\/\/\*/);
    }
  });
});
