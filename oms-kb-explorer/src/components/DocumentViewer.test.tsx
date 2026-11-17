import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DocumentViewer from './DocumentViewer';
import { kbApi } from '../services/api';

vi.mock('../services/api', () => ({
  kbApi: {
    listDocuments: vi.fn(async () => []),
    readDocument: vi.fn(),
    getLinks: vi.fn(async () => ({ outgoing: [], backlinks: [] })),
    listSections: vi.fn(async () => []),
  },
}));
vi.mock('mermaid', () => ({ default: { initialize: vi.fn(), render: vi.fn(async () => ({ svg: '<svg></svg>' })) } }));

const PATH = 'oms-knowledge-base/domain/model/order-state.md';
const CONTENT = [
  '# Order State',
  '',
  '| From | Event | To |',
  '|---|---|---|',
  '| NEW | accept | LIVE |',
  '| LIVE | fill | FILLED |',
  '',
  'Old name: ~~WORKING~~.',
  '',
  '- [x] accepted',
  '- [ ] filled',
].join('\n');

function renderViewer() {
  vi.mocked(kbApi.readDocument).mockResolvedValue({ path: PATH, content: CONTENT, totalLength: CONTENT.length, from: 0, to: CONTENT.length });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DocumentViewer selectedDoc={PATH} onSelectDoc={vi.fn()} />
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe('DocumentViewer GitHub-flavoured Markdown', () => {
  it('renders a Markdown table as a table', async () => {
    renderViewer();
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['From', 'Event', 'To']);
    const rows = within(table).getAllByRole('row').slice(1).map((tr) => within(tr).getAllByRole('cell').map((td) => td.textContent));
    expect(rows).toEqual([
      ['NEW', 'accept', 'LIVE'],
      ['LIVE', 'fill', 'FILLED'],
    ]);
    expect(screen.queryByText(/\|---\|/)).toBeNull();
  });

  it('renders strikethrough and task lists', async () => {
    renderViewer();
    expect((await screen.findByText('WORKING')).tagName).toBe('DEL');
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes.map((b) => b.checked)).toEqual([true, false]);
  });
});
