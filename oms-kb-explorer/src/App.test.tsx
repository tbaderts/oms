import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import App from './App';
import { kbApi } from './services/api';
import type { DocMeta, HybridSearchHit } from './types';

vi.mock('./services/api', () => ({
  kbApi: {
    listDocuments: vi.fn(),
    readDocument: vi.fn(),
    searchKeyword: vi.fn(),
    searchSemantic: vi.fn(),
    searchHybrid: vi.fn(),
    getLinks: vi.fn(),
    listSections: vi.fn(),
  },
}));
vi.mock('mermaid', () => ({ default: { initialize: vi.fn(), render: vi.fn(async () => ({ svg: '<svg></svg>' })) } }));

const api = vi.mocked(kbApi);

const meta = (path: string, title: string): DocMeta => ({
  path,
  name: path.split('/').pop()!,
  size: 100,
  lastModifiedIso: '2026-11-01T00:00:00Z',
  status: 'stable',
  concept: true,
  okf: { type: 'Concept', title, status: 'stable', tags: [], trustTier: 'human-reviewed' } as DocMeta['okf'],
});

const DOCS = [
  meta('oms-knowledge-base/domain/concepts/order-lifecycle.md', 'Order Lifecycle'),
  meta('oms-knowledge-base/domain/model/execution.md', 'Execution'),
];
const hit = (path: string): HybridSearchHit => ({ path, keywordScore: 0.9, semanticScore: 0, hybridScore: 0.9, snippet: 'a snippet', matchType: 'keyword' });

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<App queryClient={client} />);
}

const searchInput = () => screen.getByRole('searchbox', { name: /search the knowledge base/i }) as HTMLInputElement;

async function search(query: string) {
  fireEvent.change(searchInput(), { target: { value: query } });
  await act(async () => {
    fireEvent.submit(searchInput().closest('form')!);
  });
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  api.listDocuments.mockResolvedValue(DOCS);
  api.readDocument.mockImplementation(async (path: string) => ({ path, content: `# ${path}\n\nBody of ${path}.`, totalLength: 10, from: 0, to: 10 }));
  api.getLinks.mockResolvedValue({ outgoing: [], backlinks: [] });
  api.listSections.mockResolvedValue([]);
  api.searchKeyword.mockResolvedValue(DOCS.map((d) => ({ path: d.path, score: 90, snippet: 'a snippet' })));
  api.searchSemantic.mockResolvedValue([hit(DOCS[1].path)]);
  api.searchHybrid.mockResolvedValue([hit(DOCS[0].path)]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('KB explorer (SPEC-0066)', () => {
  it('renders the Acme Capital shell, dark only (AC-4)', async () => {
    renderApp();
    expect(screen.getByLabelText('Acme Capital Logo')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Knowledge Base' })).toBeTruthy();
    expect(screen.getByRole('contentinfo').textContent).toContain(`© ${new Date().getFullYear()} Acme Capital · Knowledge Base`);
    expect(screen.queryByRole('button', { name: /toggle theme/i })).toBeNull();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    await screen.findByText('Order Lifecycle');
  });

  it('search bar is one compact row without emoji (AC-5)', async () => {
    renderApp();
    const group = screen.getByRole('group', { name: 'Search mode' });
    const modes = within(group).getAllByRole('button');
    expect(modes.map((b) => b.textContent?.trim())).toEqual(['Keyword', 'Semantic', 'Hybrid']);
    expect(modes.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
    const bar = searchInput().closest('form')!;
    expect(within(bar).getByLabelText('Filter by type')).toBeTruthy();
    expect(within(bar).getByLabelText('Filter by tag')).toBeTruthy();
    expect(bar.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(screen.getByRole('banner').contains(bar)).toBe(true); // in the header, not a row of its own
  });

  it('switching mode re-runs the search (AC-5)', async () => {
    renderApp();
    await screen.findByText('Order Lifecycle');
    fireEvent.change(screen.getByLabelText('Filter by tag'), { target: { value: 'fix' } });
    await search('lifecycle');
    expect(api.searchKeyword).toHaveBeenCalledWith('lifecycle', 20, { type: '', tag: 'fix' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Semantic' }));
    });
    expect(api.searchSemantic).toHaveBeenCalledWith('lifecycle', 20, { type: '', tag: 'fix' });
    await waitFor(() => expect(screen.getAllByTestId('search-result')).toHaveLength(1));
    expect(screen.getByRole('button', { name: 'Semantic' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('opening a result keeps the results (AC-6)', async () => {
    renderApp();
    await screen.findByText('Order Lifecycle');
    await search('lifecycle');
    const results = await screen.findAllByTestId('search-result');
    expect(results).toHaveLength(2);
    await act(async () => {
      fireEvent.click(results[0]);
    });
    await screen.findByText(`Body of ${DOCS[0].path}.`);
    const back = screen.getByRole('button', { name: /Back to results \(2\)/ });
    await act(async () => {
      fireEvent.click(back);
    });
    expect(screen.getAllByTestId('search-result')).toHaveLength(2);
    expect(api.searchKeyword).toHaveBeenCalledTimes(1); // no new request
    api.searchKeyword.mockResolvedValueOnce([{ path: DOCS[1].path, score: 50, snippet: '' }]);
    await search('execution');
    await waitFor(() => expect(screen.getAllByTestId('search-result')).toHaveLength(1));
  });

  it('shows each hit by rank, not as a misleading percentage', async () => {
    // The API's scores are rank-fusion values (about 1/61), not percentages
    api.searchKeyword.mockResolvedValueOnce(DOCS.map((d, i) => ({ path: d.path, score: 1 / (61 + i), snippet: '' })));
    renderApp();
    await screen.findByText('Order Lifecycle');
    await search('lifecycle');
    const results = await screen.findAllByTestId('search-result');
    expect(results.map((r) => within(r).getByTestId('result-rank').textContent)).toEqual(['#1', '#2']);
    expect(results[0].textContent).not.toMatch(/\d+%/);

    api.searchHybrid.mockResolvedValueOnce([{ ...hit(DOCS[0].path), keywordScore: 0.016, semanticScore: 0.016, hybridScore: 0.032, matchType: 'hybrid' }]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Hybrid' }));
    });
    await waitFor(() => expect(screen.getAllByTestId('search-result')).toHaveLength(1));
    expect(screen.getByTestId('search-result').textContent).toMatch(/Matched by keyword and meaning/);
  });

  it('slash focuses search, Esc clears it (AC-7)', async () => {
    renderApp();
    await screen.findByText('Order Lifecycle');
    const notPrevented = fireEvent.keyDown(document.body, { key: '/' });
    expect(notPrevented).toBe(false); // default prevented: the "/" is not typed into the search box
    expect(document.activeElement).toBe(searchInput());

    const tag = screen.getByLabelText('Filter by tag') as HTMLInputElement;
    tag.focus();
    const typed = fireEvent.keyDown(tag, { key: '/' });
    expect(typed).toBe(true); // not prevented: the "/" reaches the field
    expect(document.activeElement).toBe(tag);

    await search('lifecycle');
    await screen.findAllByTestId('search-result');
    searchInput().focus();
    await act(async () => {
      fireEvent.keyDown(searchInput(), { key: 'Escape' });
    });
    expect(searchInput().value).toBe('');
    expect(screen.queryAllByTestId('search-result')).toHaveLength(0);
    expect(screen.queryByRole('region', { name: 'Search results' })).toBeNull();
    // the document view is back: with no document open, its welcome screen
    expect(screen.getByRole('heading', { name: 'OMS knowledge base' })).toBeTruthy();
  });

  it('searching shows progress in the results pane only (AC-8)', async () => {
    let answer!: (hits: { path: string; score: number; snippet: string }[]) => void;
    api.searchKeyword.mockReturnValueOnce(new Promise((r) => (answer = r)));
    renderApp();
    await screen.findByText('Order Lifecycle');
    await search('lifecycle');
    const pane = screen.getByRole('region', { name: 'Search results' });
    expect(within(pane).getByRole('status').textContent).toMatch(/Searching/);
    // the only progress indicator is inside the results pane: nothing covers the rest of the page
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(document.querySelectorAll('[class*="absolute"][class*="inset-0"]')).toHaveLength(0);
    // and the rest stays usable: the tree still opens a document while the search is pending
    await act(async () => {
      fireEvent.click(within(tree()).getByText('Execution'));
    });
    await screen.findByText(`Body of ${DOCS[1].path}.`);
    expect(searchInput().disabled).toBe(false);
    await act(async () => answer([]));
  });

  it('a failed search shows an inline error (AC-8)', async () => {
    api.searchKeyword.mockRejectedValueOnce(new Error('Search failed with HTTP 503'));
    renderApp();
    await screen.findByText('Order Lifecycle');
    await search('lifecycle');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Search failed/);
    expect(alert.textContent).toMatch(/503/);
    expect(screen.queryByText(/No results/i)).toBeNull();
  });

  it('a failed document load shows an inline error (AC-8)', async () => {
    api.readDocument.mockRejectedValueOnce(new Error('HTTP 404'));
    window.history.replaceState(null, '', `/?doc=${encodeURIComponent('oms-knowledge-base/missing.md')}`);
    renderApp();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('oms-knowledge-base/missing.md');
    expect(alert.textContent).toMatch(/404/);
  });

  it('a deep link opens its document (AC-9)', async () => {
    window.history.replaceState(null, '', `/?doc=${encodeURIComponent(DOCS[1].path)}`);
    renderApp();
    await screen.findByText(`Body of ${DOCS[1].path}.`);
    expect(api.readDocument).toHaveBeenCalledWith(DOCS[1].path);
  });
});

/** The document a tree entry opens; the tree is the "Documents" landmark. */
const tree = () => screen.getByRole('complementary', { name: 'Documents' });
const pageAside = () => screen.getByRole('complementary', { name: 'On this page' });

describe('existing behaviour still works (SPEC-0066 AC-9)', () => {
  it('a deep link with an #anchor scrolls to that heading', async () => {
    const scrolled: string[] = [];
    window.HTMLElement.prototype.scrollIntoView = vi.fn(function (this: HTMLElement) {
      scrolled.push(this.id);
    });
    api.readDocument.mockResolvedValueOnce({ path: DOCS[0].path, content: '# Lifecycle\n\n## Order States\n\nNEW, LIVE, FILLED.', totalLength: 1, from: 0, to: 1 });
    window.history.replaceState(null, '', `/?doc=${encodeURIComponent(DOCS[0].path)}#order-states`);
    renderApp();
    await screen.findByText('NEW, LIVE, FILLED.');
    await waitFor(() => expect(scrolled).toContain('order-states'));
  });

  it('Back/Forward show the document the URL names', async () => {
    renderApp();
    const first = await within(tree()).findByText('Order Lifecycle');
    await act(async () => {
      fireEvent.click(first);
    });
    await screen.findByText(`Body of ${DOCS[0].path}.`);
    await act(async () => {
      fireEvent.click(within(tree()).getByText('Execution'));
    });
    await screen.findByText(`Body of ${DOCS[1].path}.`);
    expect(new URLSearchParams(window.location.search).get('doc')).toBe(DOCS[1].path);

    await act(async () => {
      window.history.back();
    });
    await screen.findByText(`Body of ${DOCS[0].path}.`);
    expect(screen.queryByText(`Body of ${DOCS[1].path}.`)).toBeNull();

    await act(async () => {
      window.history.forward();
    });
    await screen.findByText(`Body of ${DOCS[1].path}.`);
  });

  it('Back after opening a search result still offers the kept results', async () => {
    renderApp();
    await screen.findByText('Order Lifecycle');
    await search('lifecycle');
    await act(async () => {
      fireEvent.click((await screen.findAllByTestId('search-result'))[0]);
    });
    await act(async () => {
      fireEvent.click(within(tree()).getByText('Execution'));
    });
    await act(async () => {
      window.history.back();
    });
    await screen.findByText(`Body of ${DOCS[0].path}.`);
    expect(screen.getByRole('button', { name: /Back to results \(2\)/ })).toBeTruthy();
  });

  it('the table of contents lists the sections and the links panel opens a linked document', async () => {
    api.listSections.mockResolvedValue([
      { title: 'Order States', level: 2, lineNumber: 3 },
      { title: 'Terminal States', level: 3, lineNumber: 9 },
    ]);
    api.getLinks.mockResolvedValue({ outgoing: [{ target: DOCS[1].path, exists: true }, { target: 'oms-knowledge-base/gone.md', exists: false }], backlinks: [] });
    window.history.replaceState(null, '', `/?doc=${encodeURIComponent(DOCS[0].path)}`);
    renderApp();
    await screen.findByText(`Body of ${DOCS[0].path}.`);

    const toc = await within(pageAside()).findByRole('navigation');
    expect(within(toc).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Order States', '#order-states'],
      ['Terminal States', '#terminal-states'],
    ]);
    expect(within(pageAside()).getByText('gone.md').className).toContain('line-through');

    await act(async () => {
      fireEvent.click(await within(pageAside()).findByRole('button', { name: 'Execution' }));
    });
    await screen.findByText(`Body of ${DOCS[1].path}.`);
    expect(api.readDocument).toHaveBeenCalledWith(DOCS[1].path);
  });

  it('the tree switches between Types and Folders', async () => {
    renderApp();
    await within(tree()).findByText('Order Lifecycle');
    const view = within(tree()).getByRole('group', { name: 'Tree view' });
    expect(within(view).getByRole('button', { name: /Types/ }).getAttribute('aria-pressed')).toBe('true');
    await act(async () => {
      fireEvent.click(within(view).getByRole('button', { name: /Folders/ }));
    });
    expect(within(view).getByRole('button', { name: /Folders/ }).getAttribute('aria-pressed')).toBe('true');
    expect(within(tree()).getByText('concepts')).toBeTruthy(); // folders are shown
    expect(within(tree()).getByText('Order Lifecycle')).toBeTruthy();
  });

  it('a status filter narrows the tree', async () => {
    api.listDocuments.mockResolvedValue([DOCS[0], { ...DOCS[1], status: 'draft', okf: { ...DOCS[1].okf!, status: 'draft' } }]);
    renderApp();
    await within(tree()).findByText('Execution');
    const draft = within(tree()).getByRole('button', { name: 'draft' });
    await act(async () => {
      fireEvent.click(draft);
    });
    expect(draft.getAttribute('aria-pressed')).toBe('true');
    expect(within(tree()).getByText('Execution')).toBeTruthy();
    expect(within(tree()).queryByText('Order Lifecycle')).toBeNull();
  });
});
