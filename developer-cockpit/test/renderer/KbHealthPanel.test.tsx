// @vitest-environment jsdom
// KbHealthPanel.test.tsx - The knowledge base health panel: statistics, findings and the index fix
// (SPEC-0064, AC-6 and AC-7).
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { KbHealthPanel } from '../../src/renderer/views/knowledge-base/KbHealthPanel';
import type { KbHealthReport, KbIndexFixResult } from '../../src/shared/types/kb';

const REPORT: KbHealthReport = {
  concepts: 12,
  errors: [
    { file: 'domain/index.md', rule: 'OKF-INDEX', message: 'does not link concept order.md' },
    { file: 'domain/index.md', rule: 'OKF-INDEX', message: 'does not link concept fill.md' },
  ],
  warnings: [
    { file: 'domain/order.md', rule: 'OMS-DRIFT', message: 'source oms-core/Order.java changed on 2026-12-01' },
    { file: 'ui/old.md', rule: 'OMS-AGE', message: 'not updated for more than 180 days' },
    { file: 'ui/other.md', rule: 'OMS-AGE', message: 'not updated for more than 180 days' },
  ],
  stats: {
    documents: 12,
    byType: { Requirement: 7, Specification: 5 },
    byStatus: { draft: 9, stable: 3 },
    byFolder: { capabilities: 7, domain: 3, ui: 2 },
    requirements: { total: 7, byImplementation: { implemented: 5, partial: 2 }, byPriority: { must: 4, should: 3 } },
    reviewAge: { reviewAfterDays: 180, current: 10, due: 2, unknown: 0 },
    drift: 'checked',
  },
};

const CLEAN: KbHealthReport = { ...REPORT, errors: [], warnings: [] };

const PREVIEW: KbIndexFixResult = {
  applied: false,
  changes: [{ index: 'domain/index.md', created: false, documents: ['- [Fill](fill.md) — A fill.', '- [Order](order.md) — An order.'], sections: [] }],
};

let health: ReturnType<typeof vi.fn>;
let fixIndexes: ReturnType<typeof vi.fn>;

beforeEach(() => {
  health = vi.fn(async () => REPORT);
  fixIndexes = vi.fn(async (apply: boolean) => (apply ? { ...PREVIEW, applied: true } : PREVIEW));
  (window as unknown as { cockpit: unknown }).cockpit = { kb: { health, fixIndexes, getCategories: vi.fn(async () => []) } };
});

afterEach(() => {
  cleanup();
  delete (window as unknown as { cockpit?: unknown }).cockpit;
});

function renderPanel() {
  const onOpenDocument = vi.fn();
  const onIndexesFixed = vi.fn();
  render(<KbHealthPanel onOpenDocument={onOpenDocument} onIndexesFixed={onIndexesFixed} />);
  return { onOpenDocument, onIndexesFixed };
}

describe('KbHealthPanel (SPEC-0064)', () => {
  it('shows stats and findings grouped by rule, errors first', async () => {
    renderPanel();
    const summary = await screen.findByRole('region', { name: 'Summary' });
    expect(within(summary).getByText('12')).toBeTruthy();
    expect(within(summary).getByText('Errors').parentElement?.textContent).toContain('2');
    expect(within(summary).getByText('Warnings').parentElement?.textContent).toContain('3');

    const byType = screen.getByRole('table', { name: 'By type' });
    expect(within(byType).getByText('Requirement').closest('tr')?.textContent).toContain('7');
    expect(screen.getByRole('table', { name: 'By status' })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'By folder' })).toBeTruthy();
    expect(within(screen.getByRole('table', { name: 'Requirements by implementation' })).getByText('partial')).toBeTruthy();
    expect(within(screen.getByRole('table', { name: 'Requirements by priority' })).getByText('must')).toBeTruthy();
    expect(screen.getByText(/Due for review \(older than 180 days\)/).closest('tr')?.textContent).toContain('2');

    const groups = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent);
    expect(groups).toEqual(['OKF-INDEX (2)', 'OMS-AGE (2)', 'OMS-DRIFT (1)']);
  });

  it('opens the document of a finding', async () => {
    const { onOpenDocument } = renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /domain\/order\.md/ }));
    expect(onOpenDocument).toHaveBeenCalledWith('domain/order.md');
  });

  it('shows the loading state, then the report; and an error when the check fails', async () => {
    let finish: (r: KbHealthReport) => void = () => undefined;
    health.mockImplementationOnce(() => new Promise<KbHealthReport>((r) => { finish = r; }));
    renderPanel();
    expect(screen.getByRole('status').textContent).toMatch(/Checking/);
    finish(CLEAN);
    expect(await screen.findByText(/No errors or warnings/)).toBeTruthy();

    health.mockRejectedValueOnce(new Error('The knowledge base checker was not found'));
    fireEvent.click(screen.getByRole('button', { name: 'Re-check' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/checker was not found/);
  });

  it('fix indexes previews, applies on confirm and refreshes', async () => {
    const { onIndexesFixed } = renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Fix indexes' }));

    const preview = await screen.findByRole('region', { name: 'Planned index changes' });
    expect(fixIndexes).toHaveBeenCalledTimes(1);
    expect(fixIndexes).toHaveBeenLastCalledWith(false);
    expect(within(preview).getByText('domain/index.md')).toBeTruthy();
    expect(within(preview).getByText('- [Order](order.md) — An order.')).toBeTruthy();

    health.mockResolvedValueOnce(CLEAN);
    fireEvent.click(within(preview).getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(fixIndexes).toHaveBeenLastCalledWith(true));
    await waitFor(() => expect(onIndexesFixed).toHaveBeenCalled());
    expect(health).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(/Added 2 entries/)).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Planned index changes' })).toBeNull();
  });

  it('cancel writes nothing', async () => {
    const { onIndexesFixed } = renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Fix indexes' }));
    const preview = await screen.findByRole('region', { name: 'Planned index changes' });
    fireEvent.click(within(preview).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('region', { name: 'Planned index changes' })).toBeNull();
    expect(fixIndexes).toHaveBeenCalledTimes(1);
    expect(fixIndexes).not.toHaveBeenCalledWith(true);
    expect(onIndexesFixed).not.toHaveBeenCalled();
  });

  it('says so when no index needs a change', async () => {
    fixIndexes.mockResolvedValueOnce({ applied: false, changes: [] });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Fix indexes' }));
    expect(await screen.findByText(/No index changes needed/)).toBeTruthy();
  });
});

describe('Knowledge Base view health toggle (SPEC-0064)', () => {
  it('opens the health panel, and a finding opens its document in the explorer', async () => {
    const { KnowledgeBaseView } = await import('../../src/renderer/views/knowledge-base/KnowledgeBaseView');
    const getDocument = vi.fn(async (path: string) => ({
      path: `/kb/${path}`, relativePath: path, title: 'Order', category: 'domain', folder: 'domain',
      content: 'An order to buy or sell.\n', frontmatter: { type: 'Domain Concept', status: 'draft' }, lastModified: 0,
    }));
    Object.assign((window as unknown as { cockpit: { kb: object } }).cockpit.kb, { getDocument });
    render(<KnowledgeBaseView />);

    fireEvent.click(screen.getByRole('button', { name: 'Health' }));
    fireEvent.click(await screen.findByRole('button', { name: /domain\/order\.md/ }));

    await waitFor(() => expect(getDocument).toHaveBeenCalledWith('domain/order.md'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Order' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Summary' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Document metadata' })).toBeTruthy();
  });
});

describe('KbHealthPanel review fixes (SPEC-0064)', () => {
  it('says so when the applied changes differ from the preview', async () => {
    fixIndexes.mockImplementation(async (apply: boolean) => (apply
      ? { applied: true, changes: [{ ...PREVIEW.changes[0], documents: [PREVIEW.changes[0].documents[0]] }] }
      : PREVIEW));
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Fix indexes' }));
    fireEvent.click(within(await screen.findByRole('region', { name: 'Planned index changes' })).getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText(/Added 1 entry .*differs from the planned changes/)).toBeTruthy();
  });

  it('a finding without a document keeps the panel and says why', async () => {
    const onOpenDocument = vi.fn(async () => false);
    render(<KbHealthPanel onOpenDocument={onOpenDocument} onIndexesFixed={vi.fn()} />);
    fireEvent.click((await screen.findAllByRole('button', { name: /domain\/index\.md/ }))[0]);
    expect(await screen.findByText(/domain\/index\.md is not a document in the explorer/)).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Summary' })).toBeTruthy();
  });
});

describe('Knowledge Base view and the health panel (SPEC-0064 review)', () => {
  const ORDER = {
    path: '/kb/domain/order.md', relativePath: 'domain/order.md', title: 'Order', category: 'domain', folder: 'domain',
    content: 'An order.\n', frontmatter: { status: 'draft' }, lastModified: 0,
  };

  it('picking a document in the tree closes the health panel and shows it', async () => {
    const { KnowledgeBaseView } = await import('../../src/renderer/views/knowledge-base/KnowledgeBaseView');
    Object.assign((window as unknown as { cockpit: { kb: object } }).cockpit.kb, {
      getCategories: vi.fn(async () => [{ id: 'domain', name: 'domain', path: '/kb/domain', documentCount: 1, subcategories: [] }]),
      getDocuments: vi.fn(async () => [ORDER]),
      getDocument: vi.fn(async () => ORDER),
    });
    render(<KnowledgeBaseView />);
    fireEvent.click(screen.getByRole('button', { name: 'Health' }));
    await screen.findByRole('region', { name: 'Summary' });

    // The tree comes first in the page; the health statistics list the folder too.
    fireEvent.click((await screen.findAllByText('domain'))[0]);
    fireEvent.click(await screen.findByText('Order'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Order' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Summary' })).toBeNull();
  });

  it('applying the index fix reloads the document tree (review)', async () => {
    const { KnowledgeBaseView } = await import('../../src/renderer/views/knowledge-base/KnowledgeBaseView');
    const getCategories = vi.fn(async () => []);
    Object.assign((window as unknown as { cockpit: { kb: object } }).cockpit.kb, { getCategories });
    render(<KnowledgeBaseView />);
    await waitFor(() => expect(getCategories).toHaveBeenCalled());
    const before = getCategories.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Health' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Fix indexes' }));
    fireEvent.click(within(await screen.findByRole('region', { name: 'Planned index changes' })).getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(fixIndexes).toHaveBeenLastCalledWith(true));
    await waitFor(() => expect(getCategories.mock.calls.length).toBeGreaterThan(before));
  });

  it('a finding for a file the explorer does not have keeps the panel open', async () => {
    const { KnowledgeBaseView } = await import('../../src/renderer/views/knowledge-base/KnowledgeBaseView');
    const getDocument = vi.fn(async () => undefined);
    Object.assign((window as unknown as { cockpit: { kb: object } }).cockpit.kb, { getDocument });
    render(<KnowledgeBaseView />);
    fireEvent.click(screen.getByRole('button', { name: 'Health' }));
    fireEvent.click((await screen.findAllByRole('button', { name: /domain\/index\.md/ }))[0]);
    expect(await screen.findByText(/is not a document in the explorer/)).toBeTruthy();
    expect(getDocument).toHaveBeenCalledWith('domain/index.md');
    expect(screen.getByRole('region', { name: 'Summary' })).toBeTruthy();
  });
});
