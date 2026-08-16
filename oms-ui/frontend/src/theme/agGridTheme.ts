// agGridTheme.ts - AG Grid Theming API (v33+) theme matching the app's dark UI
import { themeQuartz, colorSchemeDarkBlue, iconSetQuartzRegular } from 'ag-grid-community';

export const omsGridTheme = themeQuartz
  .withPart(colorSchemeDarkBlue)
  .withPart(iconSetQuartzRegular)
  .withParams({
    accentColor: '#007acc',
    backgroundColor: '#1e1e1e',
    foregroundColor: '#cccccc',
    chromeBackgroundColor: '#252526',
    headerBackgroundColor: '#252526',
    headerTextColor: '#ffffff',
    headerFontWeight: 600,
    oddRowBackgroundColor: '#232324',
    rowHoverColor: '#2a2d2e',
    selectedRowBackgroundColor: '#264f78',
    borderColor: '#3e3e42',
    fontFamily: 'inherit',
    fontSize: 13,
    headerFontSize: 12,
    headerHeight: 36,
    rowHeight: 30,
    cellHorizontalPadding: 12,
    spacing: 6,
    borderRadius: 4,
    wrapperBorderRadius: 6,
    valueChangeValueHighlightBackgroundColor: 'rgba(0, 122, 204, 0.35)',
  });
