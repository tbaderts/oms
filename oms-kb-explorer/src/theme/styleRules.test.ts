// styleRules.test.ts - Colours and font sizes come only from the design tokens (SPEC-0066 AC-2),
// mirroring oms-ui's theme/styleRules.test.ts. Scans every source file except tests and the token
// file. Each rule is also tested against strings it must catch and strings it must allow, so a gap
// in a pattern shows up here rather than as a regression in the UI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

const PALETTE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const UTILITY = 'bg|text|border|border-[trblxy]|ring|ring-offset|from|via|to|fill|stroke|divide|outline|placeholder|decoration|shadow|accent|caret';
/** CSS named colours a hand might type (the full list is long; these are the plausible ones). */
const NAMED = [
  'black', 'white', 'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'pink', 'gray', 'grey', 'brown', 'cyan', 'magenta',
  'lime', 'navy', 'teal', 'olive', 'maroon', 'silver', 'gold', 'indigo', 'violet', 'crimson', 'coral', 'salmon', 'tomato',
  'orchid', 'plum', 'khaki', 'beige', 'ivory', 'lavender', 'turquoise', 'aqua', 'fuchsia', 'tan', 'chocolate', 'firebrick',
  'darkgray', 'darkgrey', 'lightgray', 'lightgrey', 'dimgray', 'whitesmoke', 'gainsboro', 'darkred', 'darkblue', 'darkgreen',
  'lightblue', 'lightgreen', 'skyblue', 'steelblue', 'slategray', 'royalblue', 'dodgerblue', 'seagreen', 'forestgreen', 'goldenrod',
].join('|');
const COLOUR_PROP_CSS = 'color|background|background-color|border|border-color|border-[a-z]+-color|outline|outline-color|fill|stroke|box-shadow|text-decoration-color|caret-color';
const COLOUR_PROP_JS = 'color|background|backgroundColor|border|borderColor|border[A-Z][a-z]+Color|outline|outlineColor|fill|stroke|stopColor|floodColor|lightingColor|boxShadow|textDecorationColor|caretColor';
const COLOUR_ATTR_SVG = 'fill|stroke|stop-color|stopColor|color|flood-color|floodColor';

interface Rule {
  name: string;
  pattern: RegExp;
  /** Only files whose path matches this are scanned for the rule. */
  only?: RegExp;
  /** Strings the rule must flag, and must not flag (its self-test). */
  catches: string[];
  allows: string[];
}

const RULES: Rule[] = [
  {
    name: 'hex colour',
    pattern: /#[0-9a-fA-F]{3,8}\b(?![\w-])/,
    catches: ['color: #fff;', "background: '#1e1e1e'", 'fill="#22c55e"'],
    allows: ['href={`#${link.anchor}`}', "'#order-states'", 'id="kb-acme-grad"'],
  },
  {
    name: 'colour function',
    pattern: /\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix|color)\(/,
    catches: ['rgba(0, 0, 0, 0.5)', 'hsl(120 50% 50%)', 'oklch(70% 0.1 200)', 'hwb(0 0% 0%)', 'color-mix(in srgb, red, blue)'],
    allows: ['var(--oms-accent)', 'calc(var(--oms-space-1) + 2px)'],
  },
  {
    name: 'named colour in CSS',
    pattern: new RegExp(`(^|[;{\\s])(${COLOUR_PROP_CSS})\\s*:[^;]*\\b(${NAMED})\\b`),
    only: /\.css$/,
    catches: ['  color: red;', 'border: 1px solid black;', 'background-color: white;'],
    allows: ['color: var(--oms-text);', 'border: 1px solid var(--oms-border);', 'background: transparent;'],
  },
  {
    name: 'named colour in a style object or SVG attribute',
    pattern: new RegExp(`\\b(${COLOUR_PROP_JS})\\s*:\\s*['"\`](${NAMED})['"\`]|\\b(${COLOUR_ATTR_SVG})=["'{]+(${NAMED})["'}]`),
    only: /\.tsx?$/,
    catches: ["style={{ color: 'red' }}", 'fill="white"', "stroke='black'", "backgroundColor: \"navy\""],
    allows: ['fill="currentColor"', 'stroke="var(--oms-accent)"', 'fill="none"', "color: token('text')", 'fill="url(#kb-acme-grad)"'],
  },
  {
    name: 'palette colour class',
    // Tailwind's palette classes carry a shade (`bg-gray-800`), except white and black. The token
    // classes `text-neutral` or `bg-violet-bg` share a name but no shade, so they are not matched.
    pattern: new RegExp(`(^|[\\s"'\`:{(])(?:[a-z-]+:)*(${UTILITY})-((${PALETTE})-\\d{2,3}|white|black)(\\/\\d+)?(?=[\\s"'\`}),$]|$)`),
    only: /\.tsx?$|\.css$/,
    catches: ['"bg-gray-800"', "'dark:hover:text-blue-400'", '"text-white"', '"border-red-200/50"', '`text-sky-500${x}`', '"ring-offset-black"'],
    allows: ['"text-neutral"', '"bg-violet-bg"', '"text-accent"', '"border-border-strong"', '"bg-selection"'],
  },
  {
    name: 'arbitrary colour or size value',
    pattern: new RegExp(`(^|[\\s"'\`:{(])(?:[a-z-]+:)*(${UTILITY})-\\[`),
    only: /\.tsx?$/,
    catches: ['"bg-[red]"', '"text-[#abc]"', '"text-[11px]"', '"text-[length:12px]"', '"border-[rgb(0,0,0)]"'],
    allows: ['"text-sm"', '"w-[2px]"', '"min-w-48"'],
  },
  {
    name: 'literal font size',
    pattern: /fontSize\s*[:=]\s*['"`{]*\s*\d|font-size\s*:(?!\s*var\()|\bfont\s*:/,
    catches: ['fontSize: 12', "fontSize: '0.8rem'", 'fontSize="42"', 'fontSize={12}', 'font-size: 80%;', 'font-size: small;', 'font: 12px Arial;'],
    allows: ["fontSize: token('font-size-sm')", 'font-size: var(--oms-font-size-md);', 'fontSize: var'],
  },
  {
    name: 'Tailwind size outside the token scale',
    // Only 2xs, xs, sm, md, lg and xl exist (index.css @theme); anything else silently has no style.
    pattern: /(^|[\s"'`:])(?:[a-z-]+:)*text-(base|[2-9]xl)(?=[\s"'`]|$)/,
    only: /\.tsx?$/,
    catches: ['"text-base"', '"text-2xl"', '"md:text-3xl"'],
    allows: ['"text-2xs"', '"text-xl"', '"text-md"'],
  },
  {
    name: 'uppercase or letter spacing',
    pattern: /\b(uppercase|tracking-[a-z\d[]+)\b|letter-spacing|letterSpacing|text-transform\s*:\s*uppercase|textTransform\s*:\s*['"`]uppercase/,
    catches: ['"uppercase tracking-wider"', 'letter-spacing: 0.1em;', 'letterSpacing="1"', "letterSpacing: '0.05em'", "textTransform: 'uppercase'"],
    allows: ['"font-medium text-muted"', '"lowercase"'],
  },
];

/**
 * Deliberate exceptions, each with a reason. The Acme Capital logo's text is SVG geometry in
 * viewBox units (as in oms-ui's AcmeLogo), not a CSS size or letter spacing.
 */
const ALLOWED: { file: string; line: RegExp; rules: string[]; reason: string }[] = [
  {
    file: 'components/AcmeLogo.tsx',
    line: /<text [^>]*fontSize="42"/,
    // Only these rules are waived on that line; every other rule (e.g. a named fill) still applies.
    rules: ['literal font size', 'uppercase or letter spacing'],
    reason: 'logo text: SVG viewBox geometry, mirrors oms-ui',
  },
];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    if (!/\.(ts|tsx|css)$/.test(name) || /\.test\.tsx?$/.test(name)) return [];
    if (full === join(SRC, 'theme', 'tokens.css') || full === join(SRC, 'okf', 'fixtures.ts')) return [];
    return [full];
  });
}

/**
 * The lines of a file without comments: block comments (also multi-line, also inside JSX braces)
 * become blank lines so numbering holds; a `//` comment is cut only when it is not part of `://`.
 */
export function codeLines(text: string): string[] {
  const noBlocks = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  return noBlocks.split('\n').map((line) => line.replace(/(^|[^:\\])\/\/.*$/, '$1'));
}

function violations(rule: Rule): string[] {
  return sources(SRC)
    .filter((f) => !rule.only || rule.only.test(f))
    .flatMap((file) => {
      const rel = relative(SRC, file).replace(/\\/g, '/');
      return codeLines(readFileSync(file, 'utf8'))
        .map((line, i) => [i + 1, line] as const)
        .filter(([, line]) => rule.pattern.test(line))
        .filter(([, line]) => !ALLOWED.some((a) => a.file === rel && a.rules.includes(rule.name) && a.line.test(line)))
        .map(([n, line]) => `${rel}:${n}: ${line.trim().slice(0, 120)}`);
    });
}

for (const rule of RULES) {
  test(`no ${rule.name} outside the tokens`, () => {
    assert.deepEqual(violations(rule), []);
  });

  test(`rule "${rule.name}" catches what it is meant to`, () => {
    for (const s of rule.catches) assert.ok(rule.pattern.test(codeLines(s)[0]), `should flag: ${s}`);
    for (const s of rule.allows) assert.ok(!rule.pattern.test(codeLines(s)[0]), `should allow: ${s}`);
  });
}

test('comment stripping keeps code that contains //', () => {
  assert.equal(codeLines('<a href="https://x" className="text-blue-500">')[0], '<a href="https://x" className="text-blue-500">');
  assert.equal(codeLines('const x = 1; // bg-gray-800')[0].trim(), 'const x = 1;');
  assert.deepEqual(codeLines('a /* bg-red-500\n text-white */ b').map((l) => l.trim()), ['a', 'b']);
});

test('every allow-list entry is still needed and names real rules', () => {
  const names = RULES.map((r) => r.name);
  for (const a of ALLOWED) {
    const lines = codeLines(readFileSync(join(SRC, a.file), 'utf8'));
    assert.ok(lines.some((l) => a.line.test(l)), `unused allow-list entry for ${a.file} (${a.reason})`);
    for (const r of a.rules) assert.ok(names.includes(r), `allow-list entry for ${a.file} names unknown rule "${r}"`);
  }
});

test('an allow-listed line is still checked by the rules it does not waive', () => {
  const logoLine = '<text x="100" y="65" fontSize="42" fill="white" letterSpacing="1">';
  const named = RULES.find((r) => r.name === 'named colour in a style object or SVG attribute')!;
  assert.ok(named.pattern.test(logoLine));
  assert.ok(!ALLOWED.some((a) => a.rules.includes(named.name)), 'the logo entry must not waive the named-colour rule');
});
