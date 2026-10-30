import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { StoryboardExportService } from '../../src/main/storyboards/StoryboardExportService';
import { markdownToHtml } from '../../src/main/storyboards/markdownHtml';
import { StoryboardService } from '../../src/main/storyboards/StoryboardService';
import { DEFAULT_STORYBOARDS_CONFIG } from '../../src/shared/types/storyboards';
import { STEP_BODY, createStoryboardWorkspace, md, type StoryboardWorkspace } from '../fixtures/storyboards';

const ID = 'buy-gold-mobile';
const SEQUENCE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>customer to app</text></svg>';

function setup() {
  const ws = createStoryboardWorkspace();
  const dir = ws.writeExample();
  ws.write({
    [`${dir}/assets/shot.png`]: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    [`${dir}/assets/evil.svg`]: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    [`${dir}/steps/request-quote.md`]: md(
      {
        id: 'request-quote', title: 'Request <quote>', kind: 'user', from: 'customer', to: 'app',
        illustrations: [{ src: 'shot.png', caption: 'A screenshot' }, { src: 'evil.svg', caption: 'Rejected' }, { src: 'gone.png', caption: 'Missing one' }],
        out: [{ name: 'Quote', shape: '{ price, expiry }' }],
      },
      '\n## What happens\n\nThe customer asks. <script>alert(1)</script> <img src="https://evil.example/x.png" onerror="x">\n\n[Docs](https://example.com/docs) and [bad](javascript:alert(1)) and ![remote](https://evil.example/y.png)\n\n## Notes\n\n- A note.\n',
    ),
  });
  const svc = new StoryboardService({ workspaceRoot: ws.root, kbPath: path.join(ws.root, 'oms-knowledge-base'), config: DEFAULT_STORYBOARDS_CONFIG });
  svc.scan();
  return { ws, svc, exporter: new StoryboardExportService(svc) };
}

describe('StoryboardExportService.html', () => {
  let ws: StoryboardWorkspace;
  afterEach(() => ws?.cleanup());

  it('produces a standalone, script-free handout with every step in order', async () => {
    let exporter: StoryboardExportService;
    ({ ws, exporter } = setup());
    const r = await exporter.html(ID, SEQUENCE_SVG);
    if (!r.ok) throw new Error(r.message);
    const html = r.html;

    // no executable content and no references that leave the file
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html).not.toMatch(/(src|href)\s*=\s*["']?\s*(https?:|javascript:|storyboard-asset:|file:)/i);
    expect(html).not.toMatch(/url\(\s*['"]?https?:/i);

    // structure
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('<title>Buy gold via mobile app</title>');
    expect(html).toContain('@media print');
    const order = ['Request &lt;quote&gt;', 'Accept quote', 'Route order to market'].map((t) => html.indexOf(t));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain('The customer requests and accepts a quote');

    // illustrations: inline SVG from the Excalidraw asset, data: URL for raster, fallbacks for rejected and missing
    expect(html).toContain('payload-type:application/vnd.excalidraw+json');
    expect(html).toContain('src="data:image/png;base64,');
    expect(html).toMatch(/class="missing"[^>]*>[\s\S]*?evil\.svg/);
    expect(html).toMatch(/class="missing"[^>]*>[\s\S]*?gone\.png/);

    // the generated sequence diagram, data and alternate paths
    expect(html).toContain('customer to app');
    expect(html).toContain('Quote');
    expect(html).toContain('{ price, expiry }');
    expect(html).toContain('3a');
    expect(html).toContain('The venue rejects the instruction');
    expect(html).toContain('end of journey');

    // markdown: raw HTML dropped, external links shown as text
    expect(html).toContain('Docs (https://example.com/docs)');
    expect(html).not.toContain('alert(1)</script>');
  });

  it('falls back to the Mermaid source when the sequence SVG is missing or unsafe', async () => {
    let exporter: StoryboardExportService;
    ({ ws, exporter } = setup());
    for (const svg of [undefined, '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject/></svg>']) {
      const r = await exporter.html(ID, svg);
      if (!r.ok) throw new Error(r.message);
      expect(r.html).toContain('<pre class="mermaid-source">sequenceDiagram');
      expect(r.html).not.toMatch(/foreignObject/i);
    }
  });

  it('refuses unknown storyboards', async () => {
    let exporter: StoryboardExportService;
    ({ ws, exporter } = setup());
    expect(await exporter.html('nope')).toMatchObject({ ok: false, code: 'not-found' });
  });

  it('mermaid export honours the extensions flag', () => {
    let exporter: StoryboardExportService;
    ({ ws, exporter } = setup());
    const plain = exporter.mermaid(ID, false);
    const withExt = exporter.mermaid(ID, true);
    if (!plain.ok || !withExt.ok) throw new Error('export failed');
    expect(plain.source).not.toContain('opt ');
    expect(withExt.source).toContain('opt 3a');
  });
});

describe('markdownToHtml', () => {
  it('renders GFM, drops raw HTML and unsafe or external URLs', async () => {
    const html = await markdownToHtml('# T\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n<b onclick="x">raw</b> [x](javascript:alert(1)) [ok](#anchor) ![i](http://e/x.png)\n' + STEP_BODY);
    expect(html).toContain('<table>');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('href="#anchor"');
    expect(html).not.toContain('http://e/x.png"');
    expect(html).toContain('[image: i]');
  });
});
