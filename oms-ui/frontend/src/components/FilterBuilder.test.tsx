import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import FilterBuilder from './FilterBuilder';

jest.mock('../services/MetamodelService', () => {
  const mockMeta = {
    name: 'Order', displayName: 'Orders', primaryKey: 'id', defaultColumns: ['orderId'],
    fields: [{ name: 'orderId', displayName: 'Order Id', type: 'string', required: false, filterable: true, sortable: true }],
  };
  return {
    MetamodelService: {
      getInstance: () => ({ getMetamodel: () => mockMeta, getFilterableFields: () => mockMeta.fields }),
    },
  };
});

// SPEC-0059 AC-6: Escape closes the dialog; other keys do not.
describe('FilterBuilder keyboard (SPEC-0059)', () => {
  it('Escape closes', () => {
    const onClose = jest.fn();
    render(<FilterBuilder domainObject="Order" currentFilters={[]} onApply={() => undefined} onClose={onClose} />);
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true');
    fireEvent.keyDown(document, { key: 'x' });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
