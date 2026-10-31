// @vitest-environment jsdom
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import mermaid from 'mermaid';
import { MarkdownContent } from '../../src/renderer/components/MarkdownContent';

// Real mermaid. jsdom has no SVG layout, so give text and shapes a size.
beforeAll(() => {
  const proto = window.SVGElement.prototype as unknown as Record<string, unknown>;
  proto.getBBox = () => ({ x: 0, y: 0, width: 80, height: 20 });
  proto.getComputedTextLength = () => 80;
});

// SPEC-0014 added only `storyboard-asset:` to img-src (illustrations served by the cockpit's own protocol).
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:*; font-src 'self' data:; img-src 'self' data: storyboard-asset:";

describe('MermaidDiagram security', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete (window as unknown as Record<string, unknown>).pwned;
  });

  it('sanitises script and handlers in diagram text', async () => {
    const initialize = vi.spyOn(mermaid, 'initialize');
    // No <img> vector: mermaid waits for label images to load, which never happens in jsdom.
    // These vectors do survive under securityLevel 'loose', so the assertions below can fail.
    const source = [
      'flowchart LR',
      '  A["<b onmouseover=window.pwned=1>hover</b>"] --> B["<script>window.pwned=1</script>"]',
      '  B --> C["<a href=javascript:window.pwned=1>link</a>"]',
      '  click A call alert("x")',
      '  click C "javascript:window.pwned=1"',
    ].join('\n');

    render(<MarkdownContent content={`\`\`\`mermaid\n${source}\n\`\`\``} />);
    const diagram = await screen.findByTestId('mermaid-diagram', {}, { timeout: 15_000 });

    expect(diagram.querySelector('svg')).toBeTruthy();
    expect(diagram.querySelector('script')).toBeNull();
    const handlerAttrs = [...diagram.querySelectorAll('*')].flatMap((el) =>
      [...el.attributes].filter((a) => a.name.toLowerCase().startsWith('on')).map((a) => `${el.tagName}[${a.name}]`));
    expect(handlerAttrs).toEqual([]);
    expect(diagram.innerHTML).not.toMatch(/javascript:/i);
    expect((window as unknown as Record<string, unknown>).pwned).toBeUndefined();
    expect(initialize).toHaveBeenCalledWith(expect.objectContaining({ securityLevel: 'strict' }));
  });

  it('keeps the CSP unchanged', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../../src/renderer/index.html'), 'utf8');
    expect(html).toContain(`content="${CSP}"`);
  });
});
