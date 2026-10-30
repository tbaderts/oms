// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MarkdownContent } from '../../src/renderer/components/MarkdownContent';
import { DocumentViewer } from '../../src/renderer/views/knowledge-base/DocumentViewer';
import { useConfigStore } from '../../src/renderer/stores/config';

// jsdom cannot lay out SVG, so mermaid itself is replaced; MermaidDiagram.security.test.tsx uses the real one.
const mermaid = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(async (_id: string, source: string) => {
    if (source.includes('INVALID')) throw new Error('Parse error on line 1');
    return { svg: '<svg data-fake="1"><g>diagram</g></svg>' };
  }),
}));
vi.mock('mermaid', () => ({ default: mermaid }));

const FLOW = 'flowchart LR\n  A --> B';

function setTheme(theme: 'light' | 'dark') {
  useConfigStore.setState({
    config: { ...useConfigStore.getState().config, general: { ...useConfigStore.getState().config.general, theme } },
  });
}

describe('MermaidDiagram in MarkdownContent', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    useConfigStore.setState(useConfigStore.getInitialState(), true);
  });

  it('renders mermaid in the knowledge-base DocumentViewer', async () => {
    const { container } = render(
      <DocumentViewer
        document={{
          path: '/kb/a.md', relativePath: 'a.md', title: 'Doc', category: 'concepts',
          content: `# Doc\n\n\`\`\`mermaid\n${FLOW}\n\`\`\`\n`, frontmatter: {}, lastModified: 0,
        }}
      />,
    );

    const diagram = await screen.findByTestId('mermaid-diagram');
    expect(diagram.querySelector('svg')).toBeTruthy();
    expect(mermaid.render).toHaveBeenCalledWith(expect.any(String), FLOW);
    expect(container.querySelector('code.language-mermaid')).toBeNull();
  });

  it('shows error and source for invalid syntax and keeps rendering the rest', async () => {
    render(<MarkdownContent content={'```mermaid\nINVALID diagram\n```\n\n## After the diagram\n'} />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Parse error on line 1');
    expect(alert.textContent).toContain('INVALID diagram');
    expect(screen.getByRole('heading', { name: 'After the diagram' })).toBeTruthy();
    expect(screen.queryByTestId('mermaid-diagram')).toBeNull();
  });

  it('uses the dark theme in dark mode and re-renders on theme switch', async () => {
    setTheme('dark');
    render(<MarkdownContent content={`\`\`\`mermaid\n${FLOW}\n\`\`\``} />);
    await screen.findByTestId('mermaid-diagram');
    expect(mermaid.initialize).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'dark' }));
    expect(mermaid.render).toHaveBeenCalledTimes(1);

    act(() => setTheme('light'));

    await waitFor(() => expect(mermaid.render).toHaveBeenCalledTimes(2));
    expect(mermaid.initialize).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'default' }));
  });

  it('keeps the diagram on screen when re-rendering for a theme switch', async () => {
    // Like real mermaid: render() first removes any element with the target id, and the SVG carries that id.
    mermaid.render.mockImplementation(async (id: string) => {
      document.getElementById(id)?.remove();
      return { svg: `<svg id="${id}"><g>diagram</g></svg>` };
    });
    setTheme('dark');
    render(<MarkdownContent content={`\`\`\`mermaid\n${FLOW}\n\`\`\``} />);
    await screen.findByTestId('mermaid-diagram');

    act(() => setTheme('light'));

    await waitFor(() => expect(mermaid.render).toHaveBeenCalledTimes(2));
    const [[firstId], [secondId]] = mermaid.render.mock.calls;
    expect(secondId).not.toBe(firstId);
    await waitFor(() => expect(screen.getByTestId('mermaid-diagram').querySelector('svg')).toBeTruthy());
  });

  it('copies the exact source to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const source = 'sequenceDiagram\n  A->>B: hello\n  B-->>A: hi';
    render(<MarkdownContent content={`\`\`\`mermaid\n${source}\n\`\`\``} />);
    await screen.findByTestId('mermaid-diagram');

    fireEvent.click(screen.getByRole('button', { name: 'Copy diagram source' }));

    expect(writeText).toHaveBeenCalledWith(source);
  });

  it('reports a failed copy instead of claiming success', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Document is not focused.'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<MarkdownContent content={`\`\`\`mermaid\n${FLOW}\n\`\`\``} />);
    await screen.findByTestId('mermaid-diagram');
    const button = screen.getByRole('button', { name: 'Copy diagram source' });
    const iconBefore = button.innerHTML;

    fireEvent.click(button);

    await waitFor(() => expect(error).toHaveBeenCalledWith('Copying the diagram source failed:', expect.any(Error)));
    expect(button.innerHTML).toBe(iconBefore);
    error.mockRestore();
  });

  it('leaves other code blocks and inline code unchanged', () => {
    const { container } = render(
      <MarkdownContent content={'Use `inline()` here.\n\n```java\nclass A {}\n```\n'} />,
    );

    const block = container.querySelector('pre > code.language-java');
    expect(block).toBeTruthy();
    expect(block!.className).toContain('block');
    const inline = container.querySelector('p > code');
    expect(inline!.textContent).toBe('inline()');
    expect(inline!.className).toContain('px-1.5');
    expect(mermaid.render).not.toHaveBeenCalled();
    expect(screen.queryByTestId('mermaid-diagram')).toBeNull();
  });
});
