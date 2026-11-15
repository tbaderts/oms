// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CategoryTree } from '../../src/renderer/views/knowledge-base/CategoryTree';
import type { KbCategory, KbDocument } from '../../src/shared/types/kb';

const doc = (relativePath: string, title: string, status = 'draft'): KbDocument => ({
  path: `/kb/${relativePath}`, relativePath, title, category: relativePath.split('/')[0], folder: relativePath.split('/').slice(0, -1).join('/') || 'root',
  content: '', frontmatter: { status }, lastModified: 0,
});

const categories: KbCategory[] = [
  { id: 'archive', name: 'archive', path: '/kb/archive', documentCount: 1, subcategories: [] },
  {
    id: 'domain', name: 'domain', path: '/kb/domain', documentCount: 1, subcategories: [
      { id: 'domain/model', name: 'model', path: '/kb/domain/model', documentCount: 1, subcategories: [] },
    ],
  },
];

const byFolder: Record<string, KbDocument[]> = {
  archive: [doc('archive/old.md', 'Old Design', 'deprecated')],
  domain: [],
  'domain/model': [doc('domain/model/order.md', 'Order')],
};

describe('Knowledge base folder tree (SPEC-0061)', () => {
  afterEach(cleanup);

  it('opens nested folders and lists each folder\'s own documents', async () => {
    const getDocuments = vi.fn(async (id: string) => byFolder[id] ?? []);
    (window as unknown as { cockpit: Record<string, unknown> }).cockpit = { kb: { getDocuments } };
    const onSelect = vi.fn();
    render(<CategoryTree categories={categories} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('domain'));
    fireEvent.click(await screen.findByText('model'));
    fireEvent.click(await screen.findByText('Order'));
    expect(getDocuments).toHaveBeenCalledWith('domain/model');
    expect(onSelect).toHaveBeenCalledWith('/kb/domain/model/order.md');
  });

  it('marks deprecated documents', async () => {
    (window as unknown as { cockpit: Record<string, unknown> }).cockpit = { kb: { getDocuments: vi.fn(async (id: string) => byFolder[id] ?? []) } };
    render(<CategoryTree categories={categories} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByText('archive'));
    const entry = (await screen.findByText('Old Design')).closest('button')!;
    expect(entry.textContent).toContain('deprecated');
  });
});
