// AcmeLogo.test.tsx - The logo's colours come from tokens (SPEC-0060, AC-2).
import React from 'react';
import { render } from '@testing-library/react';
import AcmeLogo from './AcmeLogo';
import { omsTokens } from '../theme/tokens';

describe('AcmeLogo (SPEC-0060)', () => {
  it('defaults to currentColor and draws the line in the accent token', () => {
    const { container } = render(<AcmeLogo />);
    const [outline, line] = Array.from(container.querySelectorAll('path'));

    for (const text of Array.from(container.querySelectorAll('text'))) {
      expect(text.getAttribute('fill')).toBe('currentColor');
    }
    expect(outline.getAttribute('stroke')).toBe('currentColor');
    for (const stop of Array.from(container.querySelectorAll('stop'))) {
      expect(stop.getAttribute('stop-color')).toBe('currentColor');
    }
    expect(line.getAttribute('stroke')).toBe(omsTokens.accent);
  });

  it('uses a given colour for the text and the outline', () => {
    const { container } = render(<AcmeLogo color="var(--oms-text-strong)" />);
    expect(container.querySelector('text')?.getAttribute('fill')).toBe('var(--oms-text-strong)');
    expect(container.querySelector('path')?.getAttribute('stroke')).toBe('var(--oms-text-strong)');
  });
});
