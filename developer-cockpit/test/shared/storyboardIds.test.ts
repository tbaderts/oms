import { describe, expect, it } from 'vitest';
import { ASSET_NAME, EDITABLE_ASSET_NAME, SLUG, assetStem, isDomain, slugify } from '../../src/shared/storyboards/ids';
import { extensionLabel, stepLabel } from '../../src/shared/storyboards/labels';

describe('storyboard ids', () => {
  it('accepts slugs and rejects everything else', () => {
    for (const ok of ['a', 'buy-gold-mobile', '0abc', 'x'.repeat(64)]) expect(SLUG.test(ok)).toBe(true);
    for (const bad of ['', '-a', 'A', 'a_b', 'a/b', '../a', 'x'.repeat(65), 'a.b']) expect(SLUG.test(bad)).toBe(false);
  });

  it('accepts flat asset names with allowed extensions only', () => {
    for (const ok of ['route.excalidraw.svg', 'shot.png', 'a.jpg', 'a.jpeg', 'a.webp', 'plain.svg']) expect(ASSET_NAME.test(ok)).toBe(true);
    for (const bad of ['../a.svg', 'a/b.svg', 'a\\b.svg', '/abs.svg', 'C:\\x.svg', 'a.gif', 'a.svg.exe', 'A.svg', '.svg', 'a.html']) {
      expect(ASSET_NAME.test(bad)).toBe(false);
    }
    expect(EDITABLE_ASSET_NAME.test('a.excalidraw.svg')).toBe(true);
    expect(EDITABLE_ASSET_NAME.test('a.svg')).toBe(false);
  });

  it('slugifies titles', () => {
    expect(slugify('Buy gold via mobile app')).toBe('buy-gold-via-mobile-app');
    expect(slugify('  Validate & submit (v2)!  ')).toBe('validate-submit-v2');
    expect(slugify('Über Größe')).toBe('uber-grosse');
    expect(slugify('x'.repeat(80))).toHaveLength(64);
    expect(slugify('!!!')).toBe('');
  });

  it('validates nested domains', () => {
    expect(isDomain('precious-metals')).toBe(true);
    expect(isDomain('retail/precious-metals')).toBe(true);
    for (const bad of ['', '/a', 'a/', 'a//b', '../a', 'A', 'a/../b']) expect(isDomain(bad)).toBe(false);
  });

  it('keeps long extension asset names valid and distinct', () => {
    const step = 'a'.repeat(60);
    const a = assetStem(step, 'venue-rejects-because-of-an-unusually-long-reason');
    const b = assetStem(step, 'venue-rejects-because-of-an-unusually-long-reason-2');
    expect(SLUG.test(a)).toBe(true);
    expect(SLUG.test(b)).toBe(true);
    expect(a).not.toBe(b);
    expect(ASSET_NAME.test(`${a}.excalidraw.svg`)).toBe(true);
    expect(assetStem('route', undefined, 2)).toBe('route-2');
    expect(assetStem('route', 'reject')).toBe('route-reject');
    expect(assetStem('route')).toBe('route');
  });
});

describe('derived labels', () => {
  it('numbers steps from 1 and letters extensions', () => {
    expect(stepLabel(0)).toBe('1');
    expect(extensionLabel(1, 0)).toBe('2a');
    expect(extensionLabel(2, 1)).toBe('3b');
    expect(extensionLabel(0, 26)).toBe('1aa');
  });
});
