import * as fs from 'fs';
import * as path from 'path';

const COCKPIT_ROOT = path.resolve(__dirname, '..');
export const EXCALIDRAW_SVG = fs.readFileSync(path.join(COCKPIT_ROOT, 'test', 'fixtures', 'storyboards', 'excalidraw-export.excalidraw.svg'), 'utf8');
export const STORYBOARDS = path.join('oms-knowledge-base', 'storyboards');

/** Writes a small storyboard (two steps, one Excalidraw sketch) into a temporary workspace. */
export function seedStoryboard(workspace: string): string {
  const dir = path.join(workspace, STORYBOARDS, 'retail', 'buy-gold');
  const files: Record<string, string> = {
    'story.md': [
      '---',
      'id: buy-gold',
      'title: Buy gold',
      'domain: retail',
      'status: draft',
      'lanes:',
      '  - { id: customer, label: Customer, kind: actor }',
      '  - { id: oms, label: OMS, kind: system }',
      'steps:',
      '  - request-quote',
      '  - accept-quote',
      '---',
      '',
      '## Summary',
      '',
      'The customer buys gold.',
      '',
    ].join('\n'),
    'steps/request-quote.md': '---\nid: request-quote\ntitle: Request quote\nkind: user\nfrom: customer\nto: oms\n---\n\n## What happens\n\nThe customer asks for a price.\n',
    'steps/accept-quote.md': '---\nid: accept-quote\ntitle: Accept quote\nkind: user\nfrom: customer\nto: oms\nillustrations:\n  - src: accept-quote.excalidraw.svg\n    caption: Customer taps Buy\n---\n\n## What happens\n\nThe customer accepts.\n',
    'assets/accept-quote.excalidraw.svg': EXCALIDRAW_SVG,
  };
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
  return dir;
}

/** The built renderer chunk that contains Excalidraw (Rollup names it after a module, so find it by content). */
export function excalidrawChunk(): string {
  const assets = path.join(COCKPIT_ROOT, 'dist', 'renderer', 'assets');
  const name = fs.readdirSync(assets).find((f) => f.endsWith('.js') && fs.readFileSync(path.join(assets, f), 'utf8').includes('EXCALIDRAW_ASSET_PATH'));
  if (!name) throw new Error('no Excalidraw chunk in dist/renderer/assets; run npm run build');
  return name;
}

export const isRemote = (url: string) => /^https?:/i.test(url) && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/i.test(url);
