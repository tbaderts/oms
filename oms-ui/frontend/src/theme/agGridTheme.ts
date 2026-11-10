// agGridTheme.ts - AG Grid Theming API theme matching the app (SPEC-0058). Values come from
// theme/tokens.ts, the mirror of theme/_tokens.scss, so a token change reaches the grid.
import { themeQuartz, colorSchemeDark, iconSetQuartzRegular } from 'ag-grid-community';
import { omsTokens } from './tokens';

export const omsGridTheme = themeQuartz
  .withPart(colorSchemeDark)
  .withPart(iconSetQuartzRegular)
  .withParams({
    accentColor: omsTokens.accent,
    backgroundColor: omsTokens.bg,
    foregroundColor: omsTokens.text,
    chromeBackgroundColor: omsTokens.surface,
    headerBackgroundColor: omsTokens.surfaceRaised,
    headerTextColor: omsTokens.textMuted,
    headerFontWeight: 600,
    oddRowBackgroundColor: omsTokens.oddRow,
    rowHoverColor: omsTokens.hover,
    selectedRowBackgroundColor: omsTokens.selection,
    borderColor: omsTokens.border,
    fontFamily: 'inherit',
    fontSize: 13,
    headerFontSize: 12,
    headerHeight: 36,
    rowHeight: 30,
    cellHorizontalPadding: 12,
    spacing: 6,
    borderRadius: 6,
    wrapperBorderRadius: 10,
    valueChangeValueHighlightBackgroundColor: omsTokens.accentBgStrong,
  });
