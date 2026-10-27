// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { COCKPIT_ROOT } from '../fixtures/workspace';

const config = vi.fn();
vi.mock('@monaco-editor/react', () => ({ loader: { config } }));
vi.mock('monaco-editor', () => ({ editor: {}, marker: 'bundled-monaco' }));
vi.mock('monaco-editor/esm/vs/editor/editor.worker?worker', () => ({ default: class { kind = 'editor'; } }));
vi.mock('monaco-editor/esm/vs/language/json/json.worker?worker', () => ({ default: class { kind = 'json'; } }));
vi.mock('monaco-editor/esm/vs/language/css/css.worker?worker', () => ({ default: class { kind = 'css'; } }));
vi.mock('monaco-editor/esm/vs/language/html/html.worker?worker', () => ({ default: class { kind = 'html'; } }));
vi.mock('monaco-editor/esm/vs/language/typescript/ts.worker?worker', () => ({ default: class { kind = 'ts'; } }));

describe('Monaco loader', () => {
  it('configures the loader with the bundled monaco and same-origin workers', async () => {
    await import('../../src/renderer/lib/monaco');

    // The renderer CSP (script-src 'self') blocks the default CDN, so Monaco must come from the bundle.
    expect(config).toHaveBeenCalledTimes(1);
    expect(config.mock.calls[0][0].monaco).toMatchObject({ marker: 'bundled-monaco' });

    const env = (self as unknown as { MonacoEnvironment: { getWorker: (id: string, label: string) => { kind: string } } }).MonacoEnvironment;
    const kinds = Object.fromEntries(
      ['json', 'css', 'scss', 'less', 'html', 'handlebars', 'razor', 'typescript', 'javascript', 'markdown', 'yaml']
        .map((label) => [label, env.getWorker('w', label).kind]),
    );
    expect(kinds).toEqual({
      json: 'json', css: 'css', scss: 'css', less: 'css', html: 'html', handlebars: 'html', razor: 'html',
      typescript: 'ts', javascript: 'ts', markdown: 'editor', yaml: 'editor',
    });
  });

  it('every component that renders a Monaco editor configures the loader first', () => {
    // An editor mounted before lib/monaco ran would initialise the loader with the CDN default for the
    // whole session, so each user of @monaco-editor/react must import it itself.
    const src = path.join(COCKPIT_ROOT, 'src', 'renderer');
    const files = (fs.readdirSync(src, { recursive: true }) as string[]).filter((f) => /\.tsx?$/.test(f));
    const users = files.filter((f) => /from '@monaco-editor\/react'/.test(fs.readFileSync(path.join(src, f), 'utf8')))
      .filter((f) => !f.replace(/\\/g, '/').endsWith('lib/monaco.ts'));
    expect(users.length).toBeGreaterThan(0);
    for (const f of users) {
      const text = fs.readFileSync(path.join(src, f), 'utf8');
      if (/import Editor from '@monaco-editor\/react'/.test(text)) expect(text, f).toMatch(/import '@\/lib\/monaco';/);
    }
  });
});
