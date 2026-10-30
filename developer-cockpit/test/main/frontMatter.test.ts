import { describe, expect, it } from 'vitest';
import { PatchError, patchFrontMatter, serialize } from '../../src/main/storyboards/frontMatter';
import { parseFrontMatter } from '../../src/main/storyboards/parse';

/** Applies a patch to a whole file the way a save does and returns the new file text. */
function apply(text: string, patch: Record<string, unknown>): string {
  const fm = parseFrontMatter(text);
  const out = patchFrontMatter(fm.raw, fm.doc, fm.data, patch);
  return out === null ? text : serialize(out, fm.body, fm.eol);
}

describe('patchFrontMatter', () => {
  it('appends new keys in patch order without a blank line, also after editing the last key (CRLF)', () => {
    const text = '---\r\nid: a\r\ntitle: Old\r\n---\r\nbody\r\n';
    expect(apply(text, { title: 'New', owner: 'x', status: 'stable' })).toBe('---\r\nid: a\r\ntitle: New\r\nowner: x\r\nstatus: stable\r\n---\r\nbody\r\n');
  });

  it('keeps a trailing comment on an edited single-line key', () => {
    expect(apply('---\nid: a\ntitle: Old # keep me\nkind: user\n---\n', { title: 'New' })).toBe('---\nid: a\ntitle: New # keep me\nkind: user\n---\n');
  });

  it('refuses a flow-mapping front matter and keys that share a line, instead of losing data', () => {
    expect(() => apply('---\n{id: a, title: Old}\n---\n', { title: 'New' })).toThrow(PatchError);
  });

  it('removes a key with null, and treats empty lists and empty link maps as absent', () => {
    const text = '---\nid: a\nto: app\nin: [{ name: X }]\n---\n';
    expect(apply(text, { to: null })).toBe('---\nid: a\nin: [{ name: X }]\n---\n');
    expect(apply(text, { out: [], illustrations: [], links: { api: [], events: [] } })).toBe(text);
    expect(apply(text, { in: [] })).toBe('---\nid: a\nto: app\n---\n');
  });

  it('leaves a value equal apart from empty categories untouched', () => {
    const text = '---\nid: a\nlinks: { requirements: [FR-001] }\n---\n';
    expect(apply(text, { links: { requirements: ['FR-001'], api: [] } })).toBe(text);
  });
});

describe('parseFrontMatter', () => {
  it('closes the block only at a --- line, not at --- inside a value', () => {
    const fm = parseFrontMatter('---\ntitle: Foo ---\nid: a\n---\nbody\n');
    expect(fm.data).toEqual({ title: 'Foo ---', id: 'a' });
    expect(fm.body).toBe('body\n');
  });

  it('accepts an empty front matter block', () => {
    expect(parseFrontMatter('---\n---\nbody').data).toEqual({});
  });
});
