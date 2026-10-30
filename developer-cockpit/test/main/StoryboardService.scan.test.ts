import * as fs from 'fs';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { StoryboardService } from '../../src/main/storyboards/StoryboardService';
import { DEFAULT_STORYBOARDS_CONFIG, type StoryboardsConfig } from '../../src/shared/types/storyboards';
import { EXAMPLE_LANES, FILE_SYMLINKS, STEP_BODY, createStoryboardWorkspace, md, type StoryboardWorkspace } from '../fixtures/storyboards';

const SB = 'oms-knowledge-base/storyboards';

function service(ws: StoryboardWorkspace, config: Partial<StoryboardsConfig> = {}) {
  return new StoryboardService({ workspaceRoot: ws.root, kbPath: path.join(ws.root, 'oms-knowledge-base'), config: { ...DEFAULT_STORYBOARDS_CONFIG, ...config } });
}

function minimalStory(id: string, title: string, extra: Record<string, unknown> = {}) {
  return md({ id, title, status: 'stable', lanes: EXAMPLE_LANES, steps: ['only'], ...extra }, '\n## Summary\n\nShort summary.\n');
}
const onlyStep = md({ id: 'only', title: 'The only step', kind: 'system', from: 'oms', to: 'market' }, STEP_BODY);

describe('StoryboardService.scan', () => {
  let ws: StoryboardWorkspace;
  afterEach(() => ws?.cleanup());

  it('discovers roots, nested domains and cardless stories; reports duplicate, symlink, oversized and missing roots', () => {
    ws = createStoryboardWorkspace();
    ws.writeExample({ domain: 'retail/precious-metals' });
    ws.write({
      [`${SB}/fx/spot-trade/story.md`]: minimalStory('spot-trade', 'Spot trade', { domain: 'fx' }),
      [`${SB}/fx/spot-trade/steps/only.md`]: onlyStep,
      [`${SB}/fx/a-duplicate/story.md`]: minimalStory('dup', 'Duplicate one', { domain: 'fx' }),
      [`${SB}/fx/a-duplicate/steps/only.md`]: onlyStep,
      ['docs/storyboards/equities/care-order/story.md']: minimalStory('care-order', 'Care order via desk', { domain: 'equities' }),
      ['docs/storyboards/equities/care-order/steps/only.md']: onlyStep,
      ['docs/storyboards/equities/dup/story.md']: minimalStory('dup', 'Duplicate two', { domain: 'equities' }),
      ['docs/storyboards/equities/dup/steps/only.md']: onlyStep,
      [`${SB}/big/huge/story.md`]: minimalStory('huge', 'Huge', { padding: 'x'.repeat(5000) }),
      ['outside/linked-story/story.md']: minimalStory('linked-story', 'Linked'),
    });
    ws.symlink('outside/linked-story', `${SB}/linked-story`, 'dir');

    const result = service(ws, { roots: [SB, 'docs/storyboards', 'nope/storyboards'], maxSourceBytes: 4096 }).scan();

    expect(result.catalogue.map((s) => [s.domain, s.title])).toEqual([
      ['equities', 'Care order via desk'],
      ['fx', 'Spot trade'],
      ['retail/precious-metals', 'Buy gold via mobile app'],
    ]);
    const gold = result.catalogue.find((s) => s.id === 'buy-gold-mobile')!;
    expect(gold).toMatchObject({
      title: 'Buy gold via mobile app',
      description: 'The customer requests and accepts a quote, after which OMS routes the order to market.',
      status: 'draft',
      owner: 'analyst-id',
      tags: ['retail', 'mobile'],
      sourcePath: `${SB}/retail/precious-metals/buy-gold-mobile`,
      stepCount: 3,
      stepTitles: ['Request quote', 'Accept quote', 'Route order to market'],
      thumbnails: [null, 'storyboard-asset://buy-gold-mobile/accept-quote.excalidraw.svg', null],
      trust: 'unevidenced',
      drift: 'none',
      hasCard: false,
    });
    expect(gold.modified).toBeGreaterThan(0);

    const errors = result.errors.map((e) => [e.code, e.path]).sort();
    expect(errors).toEqual([
      ['duplicate-id', 'docs/storyboards/equities/dup/story.md'],
      ['duplicate-id', `${SB}/fx/a-duplicate/story.md`],
      ['missing-root', 'nope/storyboards'],
      ['oversized', `${SB}/big/huge/story.md`],
      ['symlink', `${SB}/linked-story`],
    ]);
    expect(result.roots.map((r) => r.label)).toEqual([SB, 'docs/storyboards']);
    expect(result.roots.every((r) => /^[0-9a-f]{12}$/.test(r.rootId))).toBe(true);
  });

  it('expands * segments, skips _templates, _library and dot folders', () => {
    ws = createStoryboardWorkspace();
    ws.write({
      ['team-a/proj/docs/storyboards/d/s1/story.md']: minimalStory('s1', 'One'),
      ['team-b/proj/docs/storyboards/d/s2/story.md']: minimalStory('s2', 'Two'),
      [`${SB}/_templates/story.md`]: minimalStory('template', 'Template'),
      [`${SB}/_library/x/story.md`]: minimalStory('library', 'Library'),
      [`${SB}/.hidden/x/story.md`]: minimalStory('hidden', 'Hidden'),
    });
    const result = service(ws, { roots: ['*/*/docs/storyboards', SB] }).scan();
    expect(result.catalogue.map((s) => s.id).sort()).toEqual(['s1', 's2']);
    expect(result.roots.map((r) => r.label)).toEqual(['team-a/proj/docs/storyboards', 'team-b/proj/docs/storyboards', SB]);
    expect(result.errors).toEqual([]);
  });

  it('reports malformed story front matter without dropping the others', () => {
    ws = createStoryboardWorkspace();
    ws.writeExample();
    ws.write({
      [`${SB}/bad/yaml/story.md`]: '---\nid: [unclosed\n---\nbody',
      [`${SB}/bad/no-id/story.md`]: md({ title: 'No id' }),
      [`${SB}/bad/bad-id/story.md`]: md({ id: 'Bad Id', title: 'x' }),
    });
    const result = service(ws).scan();
    expect(result.catalogue.map((s) => s.id)).toEqual(['buy-gold-mobile']);
    expect(result.errors.map((e) => e.code)).toEqual(['malformed-story', 'malformed-story', 'malformed-story']);
  });

  it('lets an evidence card supply title, description, status and tags; a malformed card is a scan error', () => {
    ws = createStoryboardWorkspace();
    const dir = ws.writeExample();
    ws.write({ [`${dir}/story.card.yaml`]: 'id: buy-gold-mobile\ntitle: "Card title"\ndescription: "From the card."\nstatus: stable\ntags: [card]\n' });
    ws.writeExample({ id: 'other', domain: 'x', title: 'Other' });
    ws.write({ [`${SB}/x/other/story.card.yaml`]: 'id: [broken' });

    const result = service(ws).scan();
    const gold = result.catalogue.find((s) => s.id === 'buy-gold-mobile')!;
    expect(gold).toMatchObject({ title: 'Card title', description: 'From the card.', status: 'stable', tags: ['card'], hasCard: true, trust: 'evidenced' });
    const other = result.catalogue.find((s) => s.id === 'other')!;
    expect(other).toMatchObject({ hasCard: true, brokenEvidence: true, trust: 'unevidenced' });
    expect(result.errors).toEqual([expect.objectContaining({ code: 'malformed-card', path: `${SB}/x/other/story.card.yaml` })]);
  });

  it('returns an empty catalogue when disabled', () => {
    ws = createStoryboardWorkspace();
    ws.writeExample();
    const result = service(ws, { enabled: false }).scan();
    expect(result).toMatchObject({ enabled: false, catalogue: [], errors: [], roots: [] });
  });

  it.skipIf(!FILE_SYMLINKS)('reports a symlinked story.md', () => {
    ws = createStoryboardWorkspace();
    ws.write({ ['outside/story.md']: minimalStory('sneaky', 'Sneaky') });
    fs.mkdirSync(path.join(ws.storyboards, 'd', 'sneaky'), { recursive: true });
    ws.symlink('outside/story.md', `${SB}/d/sneaky/story.md`);
    const result = service(ws).scan();
    expect(result.catalogue).toEqual([]);
    expect(result.errors.map((e) => e.code)).toEqual(['symlink']);
  });
});
