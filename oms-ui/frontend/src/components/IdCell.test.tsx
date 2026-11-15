import React from 'react';
import { render } from '@testing-library/react';
import IdCell from './IdCell';

describe('IdCell (SPEC-0059)', () => {
  test('keeps the end visible and shows the full id on hover', () => {
    const { container } = render(<IdCell value="ORD-20261115-000123-F1" />);
    const cell = container.querySelector('.id-cell') as HTMLElement;
    expect(cell).not.toBeNull();
    // start-truncation: the cell is right-to-left, the id itself is isolated left-to-right
    expect(cell.getAttribute('title')).toBe('ORD-20261115-000123-F1');
    expect(cell.querySelector('bdi')?.textContent).toBe('ORD-20261115-000123-F1');
  });

  test('renders nothing without a value', () => {
    const { container } = render(<IdCell value={null} />);
    expect(container.textContent).toBe('');
  });
});

// jsdom does not lay out text, so the start-truncation is asserted on the stylesheet itself (AC-4).
test('the stylesheet truncates the start and keeps the id left-to-right', () => {
  const fs = require('fs');
  const path = require('path');
  const css: string = fs.readFileSync(path.join(__dirname, 'IdCell.scss'), 'utf8');
  const rule = (selector: RegExp) => css.match(selector)?.[1] ?? '';
  const cell = rule(/\.id-cell\s*\{([\s\S]*?)\n\}/);
  for (const decl of ['direction: rtl', 'text-overflow: ellipsis', 'overflow: hidden', 'white-space: nowrap']) {
    expect(cell).toContain(decl);
  }
  const bdi = rule(/bdi\s*\{([^}]*)\}/);
  expect(bdi).toContain('direction: ltr');
  expect(bdi).toContain('unicode-bidi: isolate');
});
