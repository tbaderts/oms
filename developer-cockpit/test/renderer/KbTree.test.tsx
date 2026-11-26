// @vitest-environment jsdom
// The knowledge base tree switches between folder browsing and type browsing, as oms-kb-explorer does.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { KbTree } from '../../src/renderer/views/knowledge-base/KbTree';
import { useKnowledgeBaseStore } from '../../src/renderer/stores/knowledgeBase';
import type { KbCategory, KbTypeGroup } from '../../src/shared/types/kb';

const categories: KbCategory[] = [
  { id: 'domain', name: 'domain', path: '/kb/domain', documentCount: 1, subcategories: [] },
];

const entry = (relativePath: string, label: string, status?: string) => ({
  path: `/kb/${relativePath}`, relativePath, label, ...(status ? { status } : {}),
});

const typeGroups: KbTypeGroup[] = [
  {
    type: 'Capability', count: 2, subgroups: [
      { label: 'implemented', documents: [entry('capabilities/capture.md', 'Order Capture')] },
      { label: 'planned', documents: [entry('capabilities/quotes.md', 'Quotes')] },
    ],
  },
  {
    type: 'Domain Concept', count: 2, subgroups: [
      { label: 'Domain Concept', documents: [entry('domain/order.md', 'Order'), entry('archive/old.md', 'Old Order', 'deprecated')] },
    ],
  },
];

let getTypeGroups: ReturnType<typeof vi.fn>;

beforeEach(() => {
  useKnowledgeBaseStore.setState({ treeView: 'folders', typeGroups: [] });
  getTypeGroups = vi.fn(async () => typeGroups);
  (window as unknown as { cockpit: Record<string, unknown> }).cockpit = {
    kb: { getDocuments: vi.fn(async () => []), getTypeGroups },
  };
});
afterEach(cleanup);

const toggle = (name: 'Folders' | 'Types') =>
  within(screen.getByRole('group', { name: 'Browse the knowledge base by' })).getByRole('button', { name });

describe('Knowledge base tree: folders or types', () => {
  it('shows folders by default, and types when switched', async () => {
    render(<KbTree categories={categories} onSelect={vi.fn()} />);
    expect(toggle('Folders').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('domain')).toBeTruthy();
    expect(getTypeGroups).not.toHaveBeenCalled();

    fireEvent.click(toggle('Types'));

    expect(toggle('Types').getAttribute('aria-pressed')).toBe('true');
    const capability = await screen.findByRole('button', { name: /Capability/ });
    expect(capability.textContent).toContain('2');
    // subgroups are labelled only when a type has more than one, or its own name would be repeated
    expect(screen.getByText('implemented')).toBeTruthy();
    expect(screen.getByText('planned')).toBeTruthy();
    expect(screen.queryAllByText('Domain Concept')).toHaveLength(1);
    expect(screen.queryByText('domain')).toBeNull();
  });

  it('opens a document from the type view and marks deprecated ones', async () => {
    const onSelect = vi.fn();
    useKnowledgeBaseStore.setState({ treeView: 'types' });
    render(<KbTree categories={categories} onSelect={onSelect} />);

    fireEvent.click(await screen.findByText('Order Capture'));
    expect(onSelect).toHaveBeenCalledWith('/kb/capabilities/capture.md');
    expect(screen.getByText('Old Order').closest('button')!.textContent).toContain('deprecated');
  });

  it('collapses and expands a type', async () => {
    useKnowledgeBaseStore.setState({ treeView: 'types' });
    render(<KbTree categories={categories} onSelect={vi.fn()} />);
    const capability = await screen.findByRole('button', { name: /Capability/ });
    expect(capability.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(capability);

    expect(capability.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Order Capture')).toBeNull();
    expect(screen.getByText('Order')).toBeTruthy();
  });

  it('keeps the chosen view when the tree is shown again', async () => {
    const first = render(<KbTree categories={categories} onSelect={vi.fn()} />);
    fireEvent.click(toggle('Types'));
    await screen.findByText('Order Capture');
    first.unmount();

    render(<KbTree categories={categories} onSelect={vi.fn()} />);

    expect(toggle('Types').getAttribute('aria-pressed')).toBe('true');
    expect(await screen.findByText('Order Capture')).toBeTruthy();
  });

  it('says so when no document has a type yet', async () => {
    getTypeGroups.mockResolvedValue([]);
    useKnowledgeBaseStore.setState({ treeView: 'types' });
    render(<KbTree categories={categories} onSelect={vi.fn()} />);

    expect(await screen.findByText('No documents found')).toBeTruthy();
  });
});
