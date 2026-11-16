// contrast.test.ts - The explorer's palette is readable (SPEC-0066 AC-3): WCAG contrast ratios from
// the token values, with translucent tints composited over the page. Ported from oms-ui's
// theme/contrast.test.ts, for the surfaces and badge tones the explorer uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKENS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'tokens.css'), 'utf8');
const values: Record<string, string> = {};
for (const [, name, value] of TOKENS.matchAll(/--oms-([\w-]+):\s*([^;]+);/g)) values[name] = value.trim();

type Rgba = [number, number, number, number];

function parse(colour: string): Rgba {
  const hex = colour.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = colour.match(/^rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\s*\)$/);
  if (rgba) return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), rgba[4] === undefined ? 1 : Number(rgba[4])];
  throw new Error(`not a colour: ${colour}`);
}

const token = (name: string): Rgba => {
  if (!(name in values)) throw new Error(`no token --oms-${name}`);
  return parse(values[name]);
};

/** A translucent colour as it shows over an opaque one. */
const over = ([r, g, b, a]: Rgba, [br, bg, bb]: Rgba): Rgba => [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a), 1];

const luminance = ([r, g, b]: Rgba) => {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

function contrast(foreground: Rgba, background: Rgba): number {
  const [a, b] = [luminance(foreground), luminance(background)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

/** The surfaces the explorer paints: page, panels (header, tree, TOC), raised (document header, code). */
const SURFACES = ['bg', 'surface', 'surface-raised'];
/** The badge tones the explorer uses: status, trust, type, stale, match type, active filter. */
const TONES = ['success', 'warning', 'neutral', 'info', 'violet', 'danger', 'accent'];

const failures = (pairs: (readonly [string, number])[], min: number) =>
  pairs.filter(([, ratio]) => ratio < min).map(([pair, ratio]) => `${pair}: ${ratio.toFixed(2)}`);

test('body text meets 4.5:1 on bg, surface, surface-raised', () => {
  const pairs = ['text', 'text-strong'].flatMap((t) => SURFACES.map((s) => [`${t} on ${s}`, contrast(token(t), token(s))] as const));
  assert.deepEqual(failures(pairs, 4.5), []);
});

test('text on the accent meets 4.5:1', () => {
  assert.ok(contrast(token('text-on-accent'), token('accent')) >= 4.5);
});

test('muted and badge text meet 3:1', () => {
  const muted = SURFACES.map((s) => [`text-muted on ${s}`, contrast(token('text-muted'), token(s))] as const);
  // A badge: the tone's text on the tone's tint, over each surface it can sit on.
  const badges = TONES.flatMap((tone) =>
    SURFACES.map((s) => [`${tone} on ${tone}-bg over ${s}`, contrast(token(tone), over(token(`${tone}-bg`), token(s)))] as const),
  );
  // Links and the selected tree row.
  const accents = SURFACES.map((s) => [`accent on ${s}`, contrast(token('accent'), token(s))] as const);
  const selection = [['text-strong on selection', contrast(token('text-strong'), token('selection'))] as const];
  assert.deepEqual(failures([...muted, ...badges, ...accents, ...selection], 3), []);
});
