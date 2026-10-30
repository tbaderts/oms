// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TicketDetail } from '../../src/renderer/views/spec-tickets/TicketDetail';
import { useSpecTicketsStore } from '../../src/renderer/stores/specTickets';
import { detail, mockCockpit } from './ticket-fixtures';

const mermaid = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(async () => ({ svg: '<svg data-fake="1"><g>diagram</g></svg>' })),
}));
vi.mock('mermaid', () => ({ default: mermaid }));

const FLOW = 'flowchart LR\n  TD[TicketDetail] --> MC[MarkdownContent]';

describe('TicketDetail mermaid', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    useSpecTicketsStore.setState(useSpecTicketsStore.getInitialState(), true);
  });

  it('renders a mermaid block in design.md as a diagram', async () => {
    mockCockpit();
    useSpecTicketsStore.setState({
      selectedId: 'SPEC-0001',
      detail: detail('SPEC-0001', {
        status: 'plan',
        documents: {
          proposal: '# Proposal heading',
          design: `# Design heading\n\n\`\`\`mermaid\n${FLOW}\n\`\`\`\n\nAfter the diagram.`,
        },
      }),
    });
    const { container } = render(<TicketDetail />);

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'design.md' }));

    const diagram = await screen.findByTestId('mermaid-diagram');
    expect(diagram.querySelector('svg')).toBeTruthy();
    expect(diagram.closest('pre')).toBeNull();
    expect(mermaid.render).toHaveBeenCalledWith(expect.any(String), FLOW);
    expect(container.querySelector('code.language-mermaid')).toBeNull();
    expect(screen.getByText('After the diagram.')).toBeTruthy();
  });
});
