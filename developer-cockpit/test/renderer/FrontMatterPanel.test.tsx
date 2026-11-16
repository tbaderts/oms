// @vitest-environment jsdom
// FrontMatterPanel.test.tsx - The explorer shows a document's OKF front matter (SPEC-0064, AC-1).
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { FrontMatterPanel } from '../../src/renderer/views/knowledge-base/FrontMatterPanel';
import { DocumentViewer } from '../../src/renderer/views/knowledge-base/DocumentViewer';
import type { KbDocument } from '../../src/shared/types/kb';

const FRONT_MATTER = {
  type: 'Requirement',
  title: 'Accept new orders',
  description: 'The OMS accepts a valid new order and records it.',
  tags: ['orders', 'commands'],
  status: 'stable',
  updated: '2026-11-14T12:00:00Z',
  sources: [
    { resource: 'repo:oms-core/src/main/java/org/example/oms/OrderService.java' },
    { resource: 'https://example.com/fix-spec', last_modified: '2026-01-01T00:00:00Z' },
  ],
  aliases: ['oms-requirements/accept-orders'],
  priority: 'must',
  implementation: 'implemented',
  capability: { id: 'CAP-01', name: 'Order capture' },
  reviewers: ['alice', 'bob'],
};

describe('FrontMatterPanel (SPEC-0064)', () => {
  afterEach(cleanup);

  it('shows type, status, description, updated, tags and sources', () => {
    render(<FrontMatterPanel frontmatter={FRONT_MATTER} />);
    const panel = screen.getByRole('region', { name: 'Document metadata' });
    expect(within(panel).getByText('Requirement')).toBeTruthy();
    expect(within(panel).getByText('stable')).toBeTruthy();
    expect(within(panel).getByText('The OMS accepts a valid new order and records it.')).toBeTruthy();
    expect(within(panel).getByText(/Updated 2026-11-14/)).toBeTruthy();
    expect(within(panel).getByText('orders')).toBeTruthy();
    expect(within(panel).getByText('commands')).toBeTruthy();
    // repo: sources as code paths, others as given
    expect(within(panel).getByText('oms-core/src/main/java/org/example/oms/OrderService.java').tagName).toBe('CODE');
    expect(within(panel).getByText('https://example.com/fix-spec')).toBeTruthy();
    expect(within(panel).getByText('oms-requirements/accept-orders')).toBeTruthy();
  });

  it('marks deprecated and draft documents', () => {
    const { rerender } = render(<FrontMatterPanel frontmatter={{ status: 'deprecated', superseded_by: 'domain/model/order' }} />);
    expect(screen.getByText('deprecated').getAttribute('data-status')).toBe('deprecated');
    expect(screen.getByText(/Superseded by/)).toBeTruthy();
    expect(screen.getByText('domain/model/order')).toBeTruthy();
    rerender(<FrontMatterPanel frontmatter={{ status: 'draft' }} />);
    expect(screen.getByText('draft').getAttribute('data-status')).toBe('draft');
  });

  it('styles each status differently (review)', () => {
    const variantOf = (status: string) => {
      const { unmount } = render(<FrontMatterPanel frontmatter={{ status }} />);
      const badge = screen.getByText(status);
      const result = { variant: badge.getAttribute('data-variant'), className: badge.className };
      unmount();
      return result;
    };
    const deprecated = variantOf('deprecated');
    const draft = variantOf('draft');
    const stable = variantOf('stable');
    expect([deprecated.variant, draft.variant, stable.variant]).toEqual(['destructive', 'outline', 'secondary']);
    expect(new Set([deprecated.className, draft.className, stable.className]).size).toBe(3);
  });

  it('shows an updated value that is not a date as written (review)', () => {
    render(<FrontMatterPanel frontmatter={{ updated: 'last spring' }} />);
    expect(screen.getByText('Updated last spring')).toBeTruthy();
  });

  it('lists every other key once, formatted by type', () => {
    render(<FrontMatterPanel frontmatter={FRONT_MATTER} />);
    const more = screen.getByRole('list', { name: 'Other metadata' });
    const terms = within(more).getAllByRole('term').map((t) => t.textContent);
    expect(terms).toEqual(['priority', 'implementation', 'capability', 'reviewers']);
    expect(within(more).getByText('must')).toBeTruthy();
    expect(within(more).getByText('alice, bob')).toBeTruthy();
    expect(within(more).getByText('{"id":"CAP-01","name":"Order capture"}')).toBeTruthy();
    // Shown above, so not repeated here
    expect(terms).not.toContain('title');
    expect(terms).not.toContain('status');
  });

  it('formats a Date value and an unquoted updated', () => {
    render(<FrontMatterPanel frontmatter={{ updated: new Date('2026-11-14T12:00:00Z'), reviewed: new Date('2026-10-01T00:00:00Z') }} />);
    expect(screen.getByText(/Updated 2026-11-14/)).toBeTruthy();
    expect(screen.getByText('2026-10-01')).toBeTruthy();
  });

  it('renders nothing without front matter', () => {
    const { container } = render(<FrontMatterPanel frontmatter={{}} />);
    expect(container.innerHTML).toBe('');
  });

  it('the document viewer shows the panel for a document with front matter', () => {
    const document: KbDocument = {
      path: '/kb/x.md', relativePath: 'capabilities/x.md', title: 'Accept new orders', category: 'capabilities',
      folder: 'capabilities', content: 'Body text', frontmatter: FRONT_MATTER, lastModified: 0,
    };
    render(<DocumentViewer document={document} />);
    expect(screen.getByRole('region', { name: 'Document metadata' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Accept new orders' })).toBeTruthy();
  });
});
