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
