// agGridTheme.test.ts - The grid theme takes its type scale from the tokens (SPEC-0060, AC-1).
// The built theme does not expose its params, so the source is checked; tokens.ts itself is held
// to _tokens.scss by styleRules.test.ts#tokens.ts mirrors _tokens.scss.
import fs from 'fs';
import path from 'path';
import { omsTokens } from './tokens';

describe('AG Grid theme (SPEC-0060)', () => {
  it('takes its font sizes from the type-scale tokens', () => {
    const source = fs.readFileSync(path.join(__dirname, 'agGridTheme.ts'), 'utf8');

    expect(source).toMatch(/\bfontSize:\s*omsTokens\.fontSizeSm\b/);
    expect(source).toMatch(/\bheaderFontSize:\s*omsTokens\.fontSizeXs\b/);
    expect(source).not.toMatch(/\b(header)?[fF]ontSize:\s*['"\d]/);
    // --oms-font-size-sm and --oms-font-size-xs: the grid's 13 and 12 px at a 16 px root.
    expect(omsTokens.fontSizeSm).toBe('0.8125rem');
    expect(omsTokens.fontSizeXs).toBe('0.75rem');
  });
});
