// tokens.ts - TypeScript mirror of theme/_tokens.scss for values read from JS (the AG Grid Theming
// API). Each key is the camelCase of its CSS custom property (surfaceRaised <-> --oms-surface-raised);
// theme/styleRules.test.ts fails if a value here differs from _tokens.scss (SPEC-0058).

export const omsTokens = {
  bg: '#0e1318',
  surface: '#141a21',
  surfaceRaised: '#1a222b',
  oddRow: '#11171d',
  text: '#d5dce4',
  textMuted: '#8c99a8',
  textStrong: '#f2f5f8',
  accent: '#22c55e',
  accentHover: '#3fd477',
  accentBg: 'rgba(34, 197, 94, 0.14)',
  accentBgStrong: 'rgba(34, 197, 94, 0.28)',
  border: '#273240',
  hover: '#1c2530',
  selection: '#16362a',
} as const;
