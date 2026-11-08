// tokens.ts - TypeScript mirror of theme/_tokens.scss for values that must be read
// from JS (e.g. the AG Grid Theming API). Keep in sync with _tokens.scss.

export const omsTokens = {
  accent: '#007acc',
  accentHover: '#0098ff',
  bg: '#1e1e1e',
  surface: '#252526',
  surfaceRaised: '#2d2d30',
  text: '#cccccc',
  textStrong: '#ffffff',
  border: '#3e3e42',
  hover: '#2a2d2e',
  selection: '#264f78',
  oddRow: '#232324',
  accentBgStrong: 'rgba(0, 122, 204, 0.35)',
} as const;
