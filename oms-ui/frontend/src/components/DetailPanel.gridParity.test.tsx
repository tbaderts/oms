// DetailPanel.gridParity.test.tsx - The detail panel shows a value as the grid cell does
// (SPEC-0060, AC-8). A file of its own: it needs a typed metamodel for the grid's column
// definitions, while DetailPanel.test.tsx mocks one with enum labels only.
import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import DetailPanel from './DetailPanel';
import { ColumnConfigService } from '../services/ColumnConfigService';

jest.mock('../services/MetamodelService', () => ({
  MetamodelService: {
    getInstance: () => ({
      getMetamodel: () => ({
        name: 'Execution', displayName: 'Executions', primaryKey: 'execId',
        fields: [
          { name: 'lastPx', displayName: 'Last Px', type: 'number', required: false },
          { name: 'lastQty', displayName: 'Last Qty', type: 'number', required: false },
          { name: 'transactTime', displayName: 'Transact Time', type: 'date', required: false },
        ],
        defaultColumns: ['lastPx', 'lastQty', 'transactTime'],
      }),
    }),
  },
}));

/** What the grid's cell shows for `value` in column `field`. */
function gridText(field: string, value: unknown): string {
  const column = ColumnConfigService.getInstance().getAllColumnConfig('Execution').find(c => c.field === field)!;
  return (column.valueFormatter as (p: { value: unknown }) => string)({ value });
}

/** Every field value the panel shows, with all sections opened. */
function panelTexts(container: HTMLElement): string[] {
  container.querySelectorAll('.section-header').forEach(header => {
    if (!header.querySelector('.section-toggle.open')) fireEvent.click(header);
  });
  return Array.from(container.querySelectorAll('.field-value')).map(el => el.textContent ?? '');
}

describe('DetailPanel and grid (SPEC-0060)', () => {
  it('shows the same price, quantity and time text as the grid', () => {
    const execution = {
      orderId: 'ORD-1', execId: 'ORD-1-F1', lastPx: 170.123456789, lastQty: 12500.5, transactTime: '2026-11-15T09:30:05.123Z',
    };
    const { container } = render(<DetailPanel data={execution} />);
    const shown = panelTexts(container);

    for (const field of ['lastPx', 'lastQty', 'transactTime'] as const) {
      const expected = gridText(field, execution[field]);
      expect(expected).not.toBe('');
      expect({ field, shown: shown.includes(expected) }).toEqual({ field, shown: true });
    }
  });
});
