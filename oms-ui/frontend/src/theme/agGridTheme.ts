// agGridTheme.ts - AG Grid Theming API (v33+) theme matching the app's dark UI.
// Values come from theme/tokens.ts (the TS mirror of theme/_tokens.scss) so a token
// change propagates to the grid.
import { themeQuartz, colorSchemeDarkBlue, iconSetQuartzRegular } from 'ag-grid-community';
import { omsTokens } from './tokens';

export const omsGridTheme = themeQuartz
  .withPart(colorSchemeDarkBlue)
  .withPart(iconSetQuartzRegular)
  .withParams({
    accentColor: omsTokens.accent,
    backgroundColor: omsTokens.bg,
    foregroundColor: omsTokens.text,
    chromeBackgroundColor: omsTokens.surface,
    headerBackgroundColor: omsTokens.surface,
    headerTextColor: omsTokens.textStrong,
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
    borderRadius: 4,
    wrapperBorderRadius: 6,
    valueChangeValueHighlightBackgroundColor: omsTokens.accentBgStrong,
  });
