import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * SPEC-0015 AC-2: the stage colours are a categorical palette that stays distinguishable for
 * readers with colour-vision deficiency and with normal vision, in both themes. The metrics follow
 * the dataviz palette validator: OKLab ΔE ×100 between neighbouring donut segments (including the
 * wrap from blocked back to proposal) under Machado et al. 2009 simulation at full severity.
 */
const ORDER = ['proposal', 'design', 'plan', 'implement', 'verify', 'done', 'blocked'] as const;
const CSS = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'renderer', 'styles', 'globals.css'), 'utf8');

/** `--stage-*` values per theme; later `.dark` blocks override earlier ones, as in the browser. */
function stageTokens(selector: ':root' | '.dark'): Record<string, string> {
  const tokens: Record<string, string> = {};
  const blocks = [...CSS.matchAll(/(^|\n)(:root|\.dark)\s*\{([^}]*)\}/g)];
  for (const b of blocks) {
    if (b[2] !== ':root' && b[2] !== selector) continue;
    for (const m of b[3].matchAll(/--stage-([a-z]+):\s*(#[0-9a-fA-F]{6})/g)) tokens[m[1]] = m[2].toLowerCase();
  }
  return tokens;
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const rgb = (hex: string) => [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255));

const MACHADO: Record<string, number[][]> = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};
const simulate = (lin: number[], kind: string) => {
  if (kind === 'normal') return lin;
  const m = MACHADO[kind];
  return m.map((row) => Math.min(1, Math.max(0, row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2])));
};
function oklab([r, g, b]: number[]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
const deltaE = (a: string, b: string, kind: string) => {
  const [p, q] = [oklab(simulate(rgb(a), kind)), oklab(simulate(rgb(b), kind))];
  return 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};
const chroma = (hex: string) => {
  const [, a, b] = oklab(rgb(hex));
  return Math.hypot(a, b);
};

describe.each([':root', '.dark'] as const)('stage colours (%s)', (theme) => {
  const tokens = stageTokens(theme);
  const colours = ORDER.map((s) => tokens[s]);
  const pairs = ORDER.map((s, i) => [s, ORDER[(i + 1) % ORDER.length]] as const);

  it('distinct stage colours, CVD and normal-vision separation, chroma floor', () => {
    expect(colours.every(Boolean), JSON.stringify(tokens)).toBe(true);
    expect(new Set(colours).size).toBe(ORDER.length);
    for (const [a, b] of pairs) {
      for (const kind of ['protan', 'deutan', 'tritan']) {
        expect(deltaE(tokens[a], tokens[b], kind), `${theme} ${a}↔${b} ${kind}`).toBeGreaterThanOrEqual(8);
      }
      expect(deltaE(tokens[a], tokens[b], 'normal'), `${theme} ${a}↔${b} normal`).toBeGreaterThanOrEqual(15);
    }
    for (const s of ORDER) expect(chroma(tokens[s]), `${theme} ${s} chroma`).toBeGreaterThanOrEqual(0.1);
  });
});
