import type { CSSProperties } from 'react';

/**
 * The Prism theme for code blocks (SPEC-0066): every colour is an OMS token, the same syntax colours
 * oms-ui's JSON viewer uses, so code sits on the slate surfaces instead of a third-party palette.
 */
const token = (name: string) => `var(--oms-${name})`;

const base: CSSProperties = {
  color: token('text'),
  background: token('surface'),
  fontFamily: token('font-mono'),
  fontSize: token('font-size-sm'),
  lineHeight: 1.6,
  textAlign: 'left',
  whiteSpace: 'pre',
  wordSpacing: 'normal',
  wordBreak: 'normal',
  tabSize: 2,
  hyphens: 'none',
};

export const omsCodeTheme: Record<string, CSSProperties> = {
  'code[class*="language-"]': base,
  'pre[class*="language-"]': { ...base, margin: 0, padding: `${token('space-3')} ${token('space-4')}`, overflow: 'auto', borderRadius: token('radius-md') },
  comment: { color: token('text-muted'), fontStyle: 'italic' },
  prolog: { color: token('text-muted') },
  doctype: { color: token('text-muted') },
  cdata: { color: token('text-muted') },
  punctuation: { color: token('syntax-punctuation') },
  operator: { color: token('syntax-punctuation') },
  keyword: { color: token('syntax-keyword') },
  builtin: { color: token('syntax-keyword') },
  boolean: { color: token('syntax-keyword') },
  'class-name': { color: token('syntax-property') },
  function: { color: token('syntax-property') },
  property: { color: token('syntax-property') },
  'attr-name': { color: token('syntax-property') },
  tag: { color: token('syntax-keyword') },
  selector: { color: token('syntax-string') },
  string: { color: token('syntax-string') },
  char: { color: token('syntax-string') },
  'attr-value': { color: token('syntax-string') },
  regex: { color: token('syntax-string') },
  number: { color: token('syntax-number') },
  constant: { color: token('syntax-number') },
  symbol: { color: token('syntax-number') },
  variable: { color: token('text') },
  important: { color: token('warning'), fontWeight: 600 },
  deleted: { color: token('danger') },
  inserted: { color: token('success') },
};
