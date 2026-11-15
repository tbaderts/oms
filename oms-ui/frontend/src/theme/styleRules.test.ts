// styleRules.test.ts - The visual design's rules, checked on the sources (SPEC-0058).
//
// Colour and font size come only from the tokens in theme/_tokens.scss; theme/tokens.ts mirrors
// them for AG Grid; badges are not shouted; the footer is quiet; and no stylesheet or rule is dead.
import fs from 'fs';
import path from 'path';
import { omsTokens } from './tokens';

const SRC = path.resolve(__dirname, '..');
const TOKEN_FILE = path.join(SRC, 'theme', '_tokens.scss');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const files = walk(SRC);
const stylesheets = files.filter(f => /\.(scss|css)$/.test(f));
const sources = files.filter(f => /\.(tsx?|jsx?)$/.test(f) && !/\.test\.[tj]sx?$/.test(f));
const rel = (file: string) => path.relative(SRC, file).split(path.sep).join('/');
const read = (file: string) => fs.readFileSync(file, 'utf8');
/** CSS without comments, line breaks kept so offenders keep their line numbers. */
const stripComments = (css: string) =>
  css.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/.*$/gm, '$1');

/** `file:line: text` for every line of the non-token stylesheets that matches. */
function offenders(pattern: RegExp): string[] {
  return stylesheets
    .filter(file => file !== TOKEN_FILE)
    .flatMap(file => stripComments(read(file)).split('\n')
      .map((line, i) => (pattern.test(line) ? `${rel(file)}:${i + 1}: ${line.trim()}` : null))
      .filter((hit): hit is string => hit !== null));
}

// --- TS/TSX sources (SPEC-0060) ---------------------------------------------------------------
// Inline styles and SVG attributes reach the screen without a stylesheet, so they follow the same
// token rule. theme/tokens.ts is the mirror of the tokens and the one place a value is written.

const HEX = /#[0-9a-fA-F]{3,8}(?![\w-])/;
const COLOUR_FUNCTION = /(?<![\w-])(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix)\(/i;
/** Keywords that are no colour value: they defer to the surrounding colour or draw nothing. */
const COLOUR_KEYWORDS = new Set(['none', 'currentcolor', 'transparent', 'inherit', 'initial', 'unset', 'revert']);
/** The CSS named colours (CSS Color 4). */
const NAMED_COLOURS = new Set((
  'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown '
  + 'burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan '
  + 'darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid '
  + 'darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet '
  + 'deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro '
  + 'ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki '
  + 'lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow '
  + 'lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray '
  + 'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine '
  + 'mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen '
  + 'mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace '
  + 'olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred '
  + 'papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue '
  + 'saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey '
  + 'snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow '
  + 'yellowgreen').split(' '));
/** Style properties (camelCase, as in a React style object) and SVG attributes that take a colour. */
const COLOUR_NAMES = 'color|background|backgroundColor|backgroundImage|border|borderColor'
  + '|border(?:Top|Right|Bottom|Left|Block|Inline|BlockStart|BlockEnd|InlineStart|InlineEnd)(?:Color)?'
  + '|outline|outlineColor|boxShadow|textShadow|caretColor|accentColor|textDecorationColor|columnRuleColor'
  + '|fill|stroke|stopColor|floodColor|lightingColor';
// A style property as an object key (quoted or not) or assigned (`el.style.color = …`, not `===`).
const COLOUR_PROPERTY = new RegExp(`(?<![\\w-])['"]?(${COLOUR_NAMES})['"]?\\s*(?::|=(?!=))\\s*`, 'g');
const SVG_COLOUR_ATTRIBUTE = /(?<![\w-])(fill|stroke|stopColor|color|floodColor|lightingColor)\s*=(?!=)\s*/g;
// A style key or a `style.fontSize = …` assignment; a JSX `fontSize="42"` is SVG geometry (viewBox
// units), out of scope.
const LITERAL_FONT_SIZE =
  /(?:(?<![\w-])['"]?fontSize['"]?\s*:|\bstyle\.fontSize\s*=(?!=))\s*(?!['"`]var\(--oms-font-size-)(['"`]|-?\d)/g;
/** The `font` shorthand carries a size, so it is a literal unless it is a whole token. */
const LITERAL_FONT_SHORTHAND = /(?:(?<![\w-])['"]?font['"]?\s*:|\bstyle\.font\s*=(?!=))\s*(?!['"`]var\(--oms-)['"`]/g;

interface StringLiteral { start: number; end: number; value: string }

/**
 * Reads a TS/TSX source once: its code with comments blanked (same length, so offsets and line
 * numbers hold) and its string literals. String-aware, so a `//` or `/*` inside a string is no
 * comment. A quote starts a string only where an expression can start, so the apostrophe of JSX
 * text (`<p>Don't</p>`) does not.
 */
function scanSource(src: string): { code: string; strings: StringLiteral[] } {
  const out = src.split('');
  const strings: StringLiteral[] = [];
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      const end = src.indexOf('\n', i);
      const stop = end < 0 ? src.length : end;
      blank(i, stop);
      i = stop;
    } else if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if ((c === '"' || c === "'" || c === '`') && (c !== "'" || startsExpression(src, i))) {
      let j = i + 1;
      while (j < src.length && src[j] !== c && (c === '`' || src[j] !== '\n')) j += src[j] === '\\' ? 2 : 1;
      strings.push({ start: i, end: j + 1, value: src.slice(i + 1, j) });
      i = j + 1;
    } else {
      i++;
    }
  }
  return { code: out.join(''), strings };
}

/** True when the previous non-blank character lets an expression (and so a string) start here. */
function startsExpression(src: string, at: number): boolean {
  let k = at - 1;
  while (k >= 0 && /\s/.test(src[k])) k--;
  return k < 0 || /[=(,:?[{}!&|+;<>-]/.test(src[k]) || /\breturn$/.test(src.slice(Math.max(0, k - 5), k + 1));
}

/** `line: text` for the source offset `at`. */
function hitAt(code: string, at: number): string {
  const line = code.slice(0, at).split('\n').length;
  return `${line}: ${code.split('\n')[line - 1].trim()}`;
}

/** A literal colour value: hex, colour function or named colour, or any bare word but the keywords. */
function isColourValue(value: string): boolean {
  if (HEX.test(value) || COLOUR_FUNCTION.test(value)) return true;
  const trimmed = value.trim();
  if (/^url\(#[\w-]+\)$/.test(trimmed) || /^var\(--oms-[\w-]+\)$/.test(trimmed)) return false;
  if (/^[a-zA-Z]+$/.test(trimmed)) return !COLOUR_KEYWORDS.has(trimmed.toLowerCase());
  return trimmed.split(/[^a-zA-Z]+/).some(word => NAMED_COLOURS.has(word.toLowerCase()));
}

/**
 * The string literals of the value that starts at `at`: a quoted attribute value, every string of a
 * `{…}` attribute expression, or every string of a property value up to its `,` / `;` / line end.
 */
function valueStrings(code: string, strings: StringLiteral[], at: number): StringLiteral[] {
  const startsAt = new Map(strings.map(s => [s.start, s]));
  const quoted = startsAt.get(at);
  if (quoted) return [quoted];
  let depth = 0;
  let end = at;
  for (; end < code.length; end++) {
    const literal = startsAt.get(end);
    if (literal) {
      end = literal.end - 1;
      continue;
    }
    const ch = code[end];
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) {
      if (depth === 0) break;
      if (--depth === 0 && code[at] === '{') break;
    } else if (depth === 0 && (ch === ',' || ch === ';' || ch === '\n')) break;
  }
  return strings.filter(s => s.start >= at && s.end <= end + 1);
}

/** Colours written as values: a hex colour or a colour function inside any string literal. */
export function colourLiterals(src: string): string[] {
  const { code, strings } = scanSource(src);
  return strings.filter(s => HEX.test(s.value) || COLOUR_FUNCTION.test(s.value)).map(s => hitAt(code, s.start));
}

/**
 * Colour-valued style properties (`color: 'red'`, `border: '1px solid white'`) and SVG colour
 * attributes (`fill='red'`, `stroke={on ? 'red' : 'none'}`) given a literal colour, named colours
 * included. `none`, `currentColor`, `transparent`, `inherit`, `url(#…)` and `var(--oms-…)` pass.
 */
export function namedColourValues(src: string): string[] {
  const { code, strings } = scanSource(src);
  const hits = (pattern: RegExp) => Array.from(code.matchAll(pattern)).flatMap(m => {
    const at = (m.index ?? 0) + m[0].length;
    return valueStrings(code, strings, at).filter(s => isColourValue(s.value)).map(() => hitAt(code, m.index ?? 0));
  });
  return Array.from(new Set([...hits(COLOUR_PROPERTY), ...hits(SVG_COLOUR_ATTRIBUTE)]));
}

/** A `fontSize:` property with a literal value; the size has to be a font-size token. */
export function literalFontSizes(src: string): string[] {
  const { code } = scanSource(src);
  return [...Array.from(code.matchAll(LITERAL_FONT_SIZE)), ...Array.from(code.matchAll(LITERAL_FONT_SHORTHAND))]
    .map(m => hitAt(code, m.index ?? 0));
}

const TOKEN_MIRROR = path.join(SRC, 'theme', 'tokens.ts');
const scannedSources = () => sources.filter(file => file !== TOKEN_MIRROR && /\.tsx?$/.test(file));

/** `file:line: text` for every source hit of `detector`. */
function sourceOffenders(detector: (src: string) => string[]): string[] {
  return scannedSources().flatMap(file => detector(read(file)).map(hit => `${rel(file)}:${hit}`));
}

/** The declarations of the first rule whose selector is exactly `selector`. */
function ruleBody(file: string, selector: string): string {
  const css = stripComments(read(file));
  const start = css.search(new RegExp(`(^|[}\\s])${selector.replace('.', '\\.')}\\s*\\{`));
  expect(start).toBeGreaterThanOrEqual(0);
  const open = css.indexOf('{', start);
  return css.slice(open + 1, css.indexOf('}', open));
}

/** The custom properties declared in _tokens.scss, by name without `--oms-`. */
export function tokenValues(): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [, name, value] of Array.from(read(TOKEN_FILE).matchAll(/--oms-([\w-]+):\s*([^;]+);/g))) {
    values[name] = value.trim().replace(/\s+/g, ' ');
  }
  return values;
}

describe('style rules (SPEC-0058)', () => {
  // AC-1
  it('uses only colour tokens outside the token file', () => {
    // Hex, every CSS colour function, and named colours used as values (not inside a token name such
    // as --oms-teal, nor in a class such as .enum-sell).
    const functions = /#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix|color)\(/;
    const named = /:[^;{]*(?<![\w-])(white|black|red|green|blue|yellow|orange|purple|pink|gray|grey|silver|navy|teal|maroon|olive|lime|aqua|fuchsia|cyan|magenta)(?![\w-])/i;
    expect([...offenders(functions), ...offenders(named)]).toEqual([]);
  });

  it('uses only font-size tokens', () => {
    // The whitespace sits inside the lookahead: outside, \s* could match nothing and the lookahead
    // would then see " var(" and pass a tokenised size as a literal.
    expect(offenders(/font-size:(?!\s*var\(--oms-font-size-)/)).toEqual([]);
    // The font shorthand would carry a size past the rule above.
    expect(offenders(/(^|[\s;{])font:/)).toEqual([]);
  });

  it('tokens.ts mirrors _tokens.scss', () => {
    const css = tokenValues();
    const mismatches = Object.entries(omsTokens)
      .map(([key, value]) => {
        const name = key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
        return css[name] === String(value).replace(/\s+/g, ' ') ? null : `${key}: ts ${value}, scss ${css[name]}`;
      })
      .filter(Boolean);
    expect(mismatches).toEqual([]);
  });

  // SPEC-0060 AC-2, AC-3
  it('uses no colour literals in TS/TSX sources', () => {
    expect([...sourceOffenders(colourLiterals), ...sourceOffenders(namedColourValues)]).toEqual([]);
  });

  // SPEC-0060 AC-3
  it('uses no literal font sizes in inline styles', () => {
    expect(sourceOffenders(literalFontSizes)).toEqual([]);
  });

  // SPEC-0060 AC-3: each kind of literal is caught, and the allowed forms are not.
  it('the source rules detect each kind of literal', () => {
    const bad = [
      `<div style={{ color: '#0f172a' }} />`,
      `<div style={{ background: 'rgba(0, 0, 0, 0.5)' }} />`,
      `const shadow = \`0 0 4px hsl(120 50% 50%)\`;`,
      `<path stroke="#fff" />`,
      `<rect fill="red" />`,
      `<stop stopColor={'#22c55e'} />`,
      `<div style={{ fontSize: 12 }} />`,
      `<div style={{ fontSize: '14px' }} />`,
      // Named colours in style objects, and the forms the first version missed (SPEC-0060 review).
      `<div style={{ color: 'red' }} />`,
      `<div style={{ backgroundColor: 'white' }} />`,
      `const s = { border: '1px solid navy' };`,
      `<div style={{ color: active ? 'green' : 'var(--oms-text)' }} />`,
      `<rect fill='red' />`,
      `<rect fill = "red" />`,
      `<rect fill={active ? 'red' : 'none'} />`,
      `const c = "RGB(1,2,3)";`,
      `const u = '//x'; const c = '#fff';`,
      `<p>Don't</p><div style={{ color: '#fff' }} />`,
      // Second review pass.
      `<div style={{ backgroundImage: 'linear-gradient(red, blue)' }} />`,
      `<div style={{ borderBlockColor: 'red' }} />`,
      `const s = { 'color': 'red' };`,
      `el.style.backgroundColor = 'blue';`,
      `<div style={{ font: '12px Arial' }} />`,
      `el.style.fontSize = '12px';`,
    ];
    for (const line of bad) {
      const found = [...colourLiterals(line), ...namedColourValues(line), ...literalFontSizes(line)];
      expect({ line, found: found.length > 0 }).toEqual({ line, found: true });
    }

    const good = [
      `<path fill="none" stroke={color} />`,
      `<path stroke={omsTokens.accent} fill="url(#grad1)" />`,
      `<text fill="currentColor" fontSize="42">ACME</text>`,
      `<div style={{ fontSize: 'var(--oms-font-size-sm)', color: 'var(--oms-text)' }} />`,
      `const label = 'Order #12';`,
      `// stroke="#22c55e" in a comment`,
      `/* color: 'red' */ const x = 1;`,
      `<div style={{ background: 'none', border: '0', outline: 'none', color: 'inherit' }} />`,
      `<div style={{ border: '1px solid var(--oms-border)' }} />`,
      `<p>It's red, isn't it</p>`,
      `if (color === 'red') label = 'Red';`,
      `<div style={{ font: 'var(--oms-font-body)' }} />`,
      `const url = 'https://example.com/#top';`,
    ];
    for (const line of good) {
      const found = [...colourLiterals(line), ...namedColourValues(line), ...literalFontSizes(line)];
      expect({ line, found }).toEqual({ line, found: [] });
    }
  });

  // AC-4
  it('badges are not uppercased or letter-spaced', () => {
    const badge = ruleBody(path.join(SRC, 'components', 'EnumCellRenderer.scss'), '.enum-cell');
    expect(badge).not.toMatch(/text-transform:\s*uppercase/);
    const spacing = badge.match(/letter-spacing:\s*([\d.]+)(px|em|rem)?/);
    if (spacing) {
      const value = parseFloat(spacing[1]);
      expect(spacing[2] === 'em' ? value : value / 13).toBeLessThanOrEqual(0.02);
    }
  });

  // AC-6
  it('the footer sits on the surface colour', () => {
    expect(ruleBody(path.join(SRC, 'App.scss'), '.oms-footer')).toMatch(/background:\s*var\(--oms-surface\)/);
  });

  // AC-7
  it('every stylesheet is imported', () => {
    expect(fs.existsSync(path.join(SRC, 'App.css'))).toBe(false);
    const importers = [...sources, ...stylesheets].map(read).join('\n');
    const unimported = stylesheets
      .map(file => path.basename(file).replace(/^_/, '').replace(/\.(scss|css)$/, ''))
      .filter(name => !new RegExp(`['"/]_?${name}(\\.s?css)?['"]`).test(importers));
    expect(unimported).toEqual([]);
  });

  // AC-7: a class no component renders is a dead rule. Classes built at run time are exempt:
  // `ag-` (AG Grid's own), `enum-` (EnumCellRenderer adds `enum-<value>`), `status-` (connection state).
  it('no rule targets a class nothing renders', () => {
    const code = sources.map(read).join('\n');
    const dead = stylesheets.flatMap(file => {
      const css = stripComments(read(file));
      const selectors = css.split('{').slice(0, -1).map(chunk => chunk.split(/[;}]/).pop() || '');
      const classes = new Set(selectors.flatMap(s => Array.from(s.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g), m => m[1])));
      return Array.from(classes)
        .filter(name => !/^(ag-|enum-|status-)/.test(name))
        .filter(name => !new RegExp(`(^|[^\\w-])${name}([^\\w-]|$)`).test(code))
        .map(name => `${rel(file)}: .${name}`);
    });
    expect(dead).toEqual([]);
  });
});
