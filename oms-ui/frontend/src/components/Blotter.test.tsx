import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

// Three pages of 100 (250 total) so the Next/Last controls are enabled; the last page is partial.
const mockPagedExecutions = (page: number) => ({
  content: Array.from({ length: page === 2 ? 50 : 100 }, (_, i) => ({
    id: page * 100 + i + 1,
    orderId: `O-${page * 100 + i + 1}`,
    execId: 'E-1',
    avgPx: 10,
  })),
  page: { totalElements: 250, totalPages: 3, size: 100, number: page },
});

// Plain variables, not jest.fn: CRA's jest config resets mock implementations before each test.
let mockGetExecutionsCalls: any[][] = [];
let mockResponse: any = mockExecutions;
jest.mock('../services/OMSApiService', () => ({
  OMSApiService: {
    getInstance: async () => ({
      getExecutions: async (...args: any[]) => {
        mockGetExecutionsCalls.push(args);
        return typeof mockResponse === 'function' ? mockResponse(args[2]) : mockResponse;
      },
    }),
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

/** The (page, size) pair of the most recent search call: [filters, sort, page, size]. */
const lastCall = () => {
  const args = mockGetExecutionsCalls[mockGetExecutionsCalls.length - 1];
  return { page: args[2], size: args[3] };
};

describe('Blotter executions over REST (SPEC-0041)', () => {
  beforeEach(() => {
    mockGridProps = null;
    mockGetExecutionsCalls = [];
    mockResponse = mockExecutions;
  });

  // AC-5, AC-6: two fills of one order, and one execId on two orders, are three distinct rows
  it('keys execution rows by orderId and execId', async () => {
    render(<Blotter domainObject="Execution" />);

    await waitFor(() => expect(mockGridProps?.rowData).toHaveLength(3));
    const ids = mockGridProps.rowData.map((data: any) => mockGridProps.getRowId({ data }));
    expect(new Set(ids).size).toBe(3);
    expect(ids).toEqual(['O-1|E-1', 'O-1|E-2', 'O-2|E-1']);
  });
});

describe('Blotter paging (SPEC-0054)', () => {
  beforeEach(() => {
    mockGridProps = null;
    mockGetExecutionsCalls = [];
    mockResponse = mockExecutions;
  });

  const renderBlotter = async () => {
    render(<Blotter domainObject="Execution" />);
    await waitFor(() => expect(mockGridProps).not.toBeNull());
  };

  // AC-3, AC-4
  it('fetches with page and size params', async () => {
    mockResponse = mockPagedExecutions(0);
    await renderBlotter();
    await waitFor(() => expect(mockGetExecutionsCalls).toHaveLength(1));
    expect(lastCall()).toEqual({ page: 0, size: 100 });

    fireEvent.click(screen.getByText(/Next/));
    await waitFor(() => expect(mockGetExecutionsCalls).toHaveLength(2));
    expect(lastCall()).toEqual({ page: 1, size: 100 });
  });

  // AC-4
  it('uses the selected page size', async () => {
    await renderBlotter();
    await waitFor(() => expect(mockGetExecutionsCalls).toHaveLength(1));

    fireEvent.change(screen.getByLabelText('Page size'), { target: { value: '250' } });

    await waitFor(() => expect(mockGetExecutionsCalls).toHaveLength(2));
    expect(lastCall()).toEqual({ page: 0, size: 250 });
  });

  // AC-4
  it('resets to the first page when the page size changes', async () => {
    mockResponse = mockPagedExecutions(0);
    await renderBlotter();
    await waitFor(() => expect(mockGetExecutionsCalls).toHaveLength(1));

    fireEvent.click(screen.getByText(/Next/));
    await waitFor(() => expect(lastCall()).toEqual({ page: 1, size: 100 }));

    fireEvent.change(screen.getByLabelText('Page size'), { target: { value: '500' } });

    await waitFor(() => expect(mockGetExecutionsCalls).toHaveLength(3));
    expect(lastCall()).toEqual({ page: 0, size: 500 });
  });

  // AC-5
  it('renders the partial last page', async () => {
    mockResponse = mockPagedExecutions;
    await renderBlotter();
    await waitFor(() => expect(mockGetExecutionsCalls).toHaveLength(1));

    fireEvent.click(screen.getByText(/Last/));
    await waitFor(() => expect(lastCall()).toEqual({ page: 2, size: 100 }));
    await waitFor(() => expect(mockGridProps.rowData).toHaveLength(50));
  });
});

// AC-6: the public face of the project must not use emoji glyphs as UI chrome.
const EMOJI_PATTERN = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{25FB}-\u{25FE}\u{1F7E2}\u{1F7E1}\u{1F534}\u{26AA}]/u;

describe('Blotter professional chrome (SPEC-0054)', () => {
  beforeEach(() => {
    mockGridProps = null;
    mockGetExecutionsCalls = [];
    mockResponse = mockExecutions;
  });

  it('noEmojiInControls: toolbar and pagination contain no emoji glyphs', async () => {
    render(<Blotter domainObject="Execution" />);
    await waitFor(() => expect(mockGridProps).not.toBeNull());

    const container = document.querySelector('.blotter-container') as HTMLElement;
    expect(container.textContent).not.toMatch(EMOJI_PATTERN);
  });
});
