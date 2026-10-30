import * as fs from 'fs';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseAssetUrl, resolveAsset } from '../../src/main/storyboards/assets';
import { StoryboardService } from '../../src/main/storyboards/StoryboardService';
import { DEFAULT_STORYBOARDS_CONFIG } from '../../src/shared/types/storyboards';
import { EXCALIDRAW_SVG, FILE_SYMLINKS, createStoryboardWorkspace, type StoryboardWorkspace } from '../fixtures/storyboards';

function setup(maxAssetBytes = DEFAULT_STORYBOARDS_CONFIG.maxAssetBytes) {
  const ws = createStoryboardWorkspace();
  const dir = ws.writeExample();
  ws.write({
    [`${dir}/assets/shot.png`]: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    [`${dir}/assets/photo.jpg`]: Buffer.from([0xff, 0xd8]),
    [`${dir}/assets/photo.jpeg`]: Buffer.from([0xff, 0xd8]),
    [`${dir}/assets/pic.webp`]: Buffer.from('RIFF'),
    [`${dir}/assets/page.html`]: '<script>x</script>',
    [`${dir}/assets/big.png`]: Buffer.alloc(2048),
    [`${dir}/assets/nested/inner.png`]: Buffer.from([1]),
    ['oms-knowledge-base/secret.png']: Buffer.from([1]),
  });
  const svc = new StoryboardService({
    workspaceRoot: ws.root,
    kbPath: path.join(ws.root, 'oms-knowledge-base'),
    config: { ...DEFAULT_STORYBOARDS_CONFIG, maxAssetBytes },
  });
  svc.scan();
  return { ws, dir, svc };
}

describe('resolveAsset', () => {
  let ws: StoryboardWorkspace;
  afterEach(() => ws?.cleanup());

  it('serves an SVG with an explicit type, a restrictive CSP and nosniff', () => {
    let svc: StoryboardService;
    ({ ws, svc } = setup());
    const r = resolveAsset(svc, 'buy-gold-mobile', 'accept-quote.excalidraw.svg');
    expect(r.status).toBe(200);
    expect(r.headers['Content-Type']).toBe('image/svg+xml');
    expect(r.headers['Content-Security-Policy']).toMatch(/^default-src 'none'/);
    expect(r.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(r.body?.toString('utf8')).toBe(EXCALIDRAW_SVG);
  });

  it('serves raster images with explicit types', () => {
    let svc: StoryboardService;
    ({ ws, svc } = setup());
    expect(resolveAsset(svc, 'buy-gold-mobile', 'shot.png').headers['Content-Type']).toBe('image/png');
    expect(resolveAsset(svc, 'buy-gold-mobile', 'photo.jpg').headers['Content-Type']).toBe('image/jpeg');
    expect(resolveAsset(svc, 'buy-gold-mobile', 'photo.jpeg').headers['Content-Type']).toBe('image/jpeg');
    expect(resolveAsset(svc, 'buy-gold-mobile', 'pic.webp').headers['Content-Type']).toBe('image/webp');
    expect(resolveAsset(svc, 'buy-gold-mobile', 'shot.png').headers['Content-Security-Policy']).toBeUndefined();
  });

  it('refuses unknown and invalid storyboard ids', () => {
    let svc: StoryboardService;
    ({ ws, svc } = setup());
    expect(resolveAsset(svc, 'nope', 'shot.png').status).toBe(404);
    expect(resolveAsset(svc, '..', 'shot.png').status).toBe(404);
    expect(resolveAsset(svc, 'Buy-Gold-Mobile', 'shot.png').status).toBe(404);
  });

  it('refuses traversal, absolute, nested and disallowed names', () => {
    let svc: StoryboardService;
    ({ ws, svc } = setup());
    for (const name of ['../story.md', '..\\story.md', '../../secret.png', '/etc/passwd', 'C:\\Windows\\win.ini', 'nested/inner.png', 'nested\\inner.png', 'page.html', 'story.md', '', '.png']) {
      expect(resolveAsset(svc, 'buy-gold-mobile', name).status, name).toBe(400);
    }
  });

  it('refuses a missing file and an oversized file', () => {
    let svc: StoryboardService;
    ({ ws, svc } = setup(1024));
    expect(resolveAsset(svc, 'buy-gold-mobile', 'nothere.png').status).toBe(404);
    expect(resolveAsset(svc, 'buy-gold-mobile', 'big.png').status).toBe(413);
  });

  it('refuses an assets folder that is a link to somewhere else', () => {
    let svc: StoryboardService;
    let dir: string;
    ({ ws, svc, dir } = setup());
    fs.renameSync(path.join(ws.root, dir, 'assets'), path.join(ws.root, 'moved-assets'));
    ws.symlink('moved-assets', `${dir}/assets`, 'dir');
    expect(resolveAsset(svc, 'buy-gold-mobile', 'shot.png').status).toBe(404);
  });

  it.skipIf(!FILE_SYMLINKS)('refuses a symlinked asset', () => {
    let svc: StoryboardService;
    let dir: string;
    ({ ws, svc, dir } = setup());
    ws.symlink('oms-knowledge-base/secret.png', `${dir}/assets/link.png`);
    expect(resolveAsset(svc, 'buy-gold-mobile', 'link.png').status).toBe(404);
  });
});

describe('parseAssetUrl', () => {
  it('takes the host as the id and the decoded path as the name', () => {
    expect(parseAssetUrl('storyboard-asset://buy-gold-mobile/accept-quote.excalidraw.svg')).toEqual({ id: 'buy-gold-mobile', name: 'accept-quote.excalidraw.svg' });
    expect(parseAssetUrl('storyboard-asset://buy-gold-mobile/a%2F..%2Fstory.md')).toEqual({ id: 'buy-gold-mobile', name: 'a/../story.md' });
    expect(parseAssetUrl('storyboard-asset://buy-gold-mobile/nested/inner.png')).toEqual({ id: 'buy-gold-mobile', name: 'nested/inner.png' });
    expect(parseAssetUrl('https://evil.example/x.png')).toBeNull();
    expect(parseAssetUrl('not a url')).toBeNull();
  });
});
