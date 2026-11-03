import React from 'react';
import { render, waitFor } from '@testing-library/react';
import Blotter from './Blotter';

// AG Grid is stubbed: the test reads the rows and the getRowId the blotter hands it.
let mockGridProps: any = null;
jest.mock('ag-grid-react', () => ({
  AgGridReact: (props: any) => {
    mockGridProps = props;
    return null;
  },
}));
jest.mock('../theme/agGridTheme', () => ({ omsGridTheme: {} }));

const mockExecutions = {
  content: [
    { id: 1, orderId: 'O-1', execId: 'E-1', avgPx: 10 },
    { id: 2, orderId: 'O-1', execId: 'E-2', avgPx: 10.6 },
    { id: 3, orderId: 'O-2', execId: 'E-1', avgPx: 20 },
  ],
  page: { totalElements: 3, totalPages: 1, size: 100, number: 0 },
};
jest.mock('../services/OMSApiService', () => ({
  OMSApiService: {
    getInstance: async () => ({ getExecutions: async () => mockExecutions }),
  },
}));
jest.mock('../services/MetamodelService', () => ({
  MetamodelService: {
    getInstance: () => ({
      getMetamodelAsync: async () => undefined,
      getMetamodel: () => ({ displayName: 'Executions', defaultColumns: ['execId'], fields: [], primaryKey: 'execId' }),
    }),
  },
}));
jest.mock('../services/ColumnConfigService', () => ({
  ColumnConfigService: { getInstance: () => ({ getColumnConfig: () => [] }) },
}));
jest.mock('../services/BlotterStateService', () => ({
  BlotterStateService: { getInstance: () => ({ getState: () => null, saveState: jest.fn() }) },
}));

describe('Blotter executions over REST (SPEC-0041)', () => {
  // AC-5, AC-6: two fills of one order, and one execId on two orders, are three distinct rows
  it('keys execution rows by orderId and execId', async () => {
    render(<Blotter domainObject="Execution" />);

    await waitFor(() => expect(mockGridProps?.rowData).toHaveLength(3));
    const ids = mockGridProps.rowData.map((data: any) => mockGridProps.getRowId({ data }));
    expect(new Set(ids).size).toBe(3);
    expect(ids).toEqual(['O-1|E-1', 'O-1|E-2', 'O-2|E-1']);
  });
});
