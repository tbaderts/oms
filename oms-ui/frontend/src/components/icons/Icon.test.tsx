import React from 'react';
import { render } from '@testing-library/react';
import Icon, { ICON_NAMES } from './Icon';

// SPEC-0058 AC-5: real icons, not text standing in for them.
describe('Icon', () => {
  it.each(ICON_NAMES)('draws %s as a decorative SVG', name => {
    const { container } = render(<Icon name={name} />);
    const svg = container.querySelector('svg');

    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('aria-hidden')).toBe('true');
    expect(svg!.getAttribute('focusable')).toBe('false');
    expect(svg!.querySelectorAll('path, circle, rect, line, polyline').length).toBeGreaterThan(0);
    expect(container.textContent).toBe('');
  });

  it('takes a size and a class', () => {
    const { container } = render(<Icon name="time" size={20} className="section-icon" />);
    const svg = container.querySelector('svg')!;

    expect(svg.getAttribute('width')).toBe('20');
    expect(svg.getAttribute('height')).toBe('20');
    expect(svg.getAttribute('class')).toBe('oms-icon section-icon');
  });

  it('covers the detail sections and the toolbar actions', () => {
    expect(ICON_NAMES).toEqual(expect.arrayContaining([
      'id', 'instrument', 'order', 'execution', 'status', 'time', 'settlement', 'derivative', 'misc', 'unassigned',
      'filter', 'columns', 'refresh', 'autosize', 'pause', 'play', 'connect', 'disconnect', 'close', 'key',
    ]));
  });
});
