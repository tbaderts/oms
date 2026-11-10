// contrast.test.ts - The palette is readable (SPEC-0058 AC-2): WCAG contrast ratios computed from
// the token values, with translucent backgrounds composited over the surface they sit on.
import fs from 'fs';
import path from 'path';

const TOKENS = fs.readFileSync(path.join(__dirname, '_tokens.scss'), 'utf8');
const values: Record<string, string> = {};
for (const [, name, value] of Array.from(TOKENS.matchAll(/--oms-([\w-]+):\s*([^;]+);/g))) {
  values[name] = value.trim();
}

type Rgba = [number, number, number, number];

function parse(colour: string): Rgba {
  const hex = colour.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = colour.match(/^rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\s*\)$/);
  if (rgba) {
    return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), rgba[4] === undefined ? 1 : Number(rgba[4])];
  }
  throw new Error(`not a colour: ${colour}`);
}

const token = (name: string): Rgba => {
  if (!(name in values)) throw new Error(`no token --oms-${name}`);
  return parse(values[name]);
};

/** A translucent colour as it shows over an opaque one. */
const over = ([r, g, b, a]: Rgba, [br, bg, bb]: Rgba): Rgba =>
  [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a), 1];

const luminance = ([r, g, b]: Rgba) => {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

export function contrast(foreground: Rgba, background: Rgba): number {
  const [a, b] = [luminance(foreground), luminance(background)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

const SURFACES = ['bg', 'surface', 'surface-raised', 'surface-overlay'];
const TONES = ['success', 'danger', 'warning', 'info', 'neutral', 'violet', 'orange', 'teal', 'accent'];

describe('palette contrast (SPEC-0058 AC-2)', () => {
  it('body text meets 4.5:1 on every surface', () => {
    const failures = ['text', 'text-strong'].flatMap(text => SURFACES
      .map(surface => [text, surface, contrast(token(text), token(surface))] as const)
      .filter(([, , ratio]) => ratio < 4.5)
      .map(([t, s, ratio]) => `${t} on ${s}: ${ratio.toFixed(2)}`));
    expect(failures).toEqual([]);
  });

  it('the text on the accent button meets 4.5:1', () => {
    expect(contrast(token('text-on-accent'), token('accent'))).toBeGreaterThanOrEqual(4.5);
  });

  it('muted and badge text meet 3:1', () => {
    const muted = SURFACES.slice(0, 3)
      .map(surface => [`text-muted on ${surface}`, contrast(token('text-muted'), token(surface))] as const);
    // A badge: the tone's text on the tone's tint, over the surface the grid sits on.
    const badges = TONES.map(tone => [
      `${tone} on ${tone}-bg`,
      contrast(token(tone), over(token(`${tone}-bg`), token('bg'))),
    ] as const);
    const failures = [...muted, ...badges].filter(([, ratio]) => ratio < 3).map(([pair, ratio]) => `${pair}: ${ratio.toFixed(2)}`);
    expect(failures).toEqual([]);
  });

  it('no VS Code palette value remains', () => {
    expect(TOKENS.toLowerCase()).not.toMatch(/#1e1e1e|#252526|#007acc|#cccccc/);
  });
});
