import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { EvidenceService } from '../../src/main/storyboards/EvidenceService';
import { StoryboardService } from '../../src/main/storyboards/StoryboardService';
import { DEFAULT_STORYBOARDS_CONFIG } from '../../src/shared/types/storyboards';
import { createStoryboardWorkspace, md, type StoryboardWorkspace } from '../fixtures/storyboards';

const SOURCE = 'oms-core/src/main/java/OrderCaptureService.java';
const lines = (n: number, tag = 'v1') => Array.from({ length: n }, (_, i) => `line ${i + 1} ${tag}`).join('\n') + '\n';

function setup() {
  const ws = createStoryboardWorkspace({ git: true });
  ws.write({ [SOURCE]: lines(40), 'oms-knowledge-base/domain/order.md': md({ title: 'Order' }) });
  const dir = ws.writeExample();
  ws.git('add', '.');
  ws.git('commit', '-q', '-m', 'base');
  const commit = ws.git('rev-parse', '--short', 'HEAD');
  return { ws, dir, commit };
}

function card(commit: string, extra: Record<string, unknown> = {}) {
  return stringify({
    id: 'buy-gold-mobile',
    kb_links: ['/domain/order.md'],
    evidence: {
      repos: [{ module: 'oms-core', commit }],
      sources: [{ module: 'oms-core', path: 'src/main/java/OrderCaptureService.java', line: 10, end_line: 20, label: 'capture' }],
    },
    ...extra,
  });
}

function scanOne(ws: StoryboardWorkspace) {
  const kbPath = path.join(ws.root, 'oms-knowledge-base');
  const evidence = new EvidenceService({ workspaceRoot: ws.root, kbPath });
  const svc = new StoryboardService({ workspaceRoot: ws.root, kbPath, config: DEFAULT_STORYBOARDS_CONFIG, evaluateCard: evidence.evaluator() });
  const result = svc.scan();
  return { svc, summary: result.catalogue.find((s) => s.id === 'buy-gold-mobile')!, result };
}

const editLine = (text: string, n: number) => text.split('\n').map((l, i) => (i === n - 1 ? `${l} changed` : l)).join('\n');

describe('EvidenceService', () => {
  let ws: StoryboardWorkspace;
  afterEach(() => ws?.cleanup());

  it('reports current when the cited lines are unchanged since the pinned commit', () => {
    let dir: string;
    let commit: string;
    ({ ws, dir, commit } = setup());
    ws.write({ [`${dir}/story.card.yaml`]: card(commit) });
    // a later commit that touches other lines only
    ws.write({ [SOURCE]: editLine(ws.read(SOURCE), 35) });
    ws.git('commit', '-q', '-am', 'elsewhere');
    const { summary } = scanOne(ws);
    expect(summary).toMatchObject({ hasCard: true, trust: 'evidenced', drift: 'current', brokenEvidence: false });
  });

  it('reports drifted after a committed change inside the cited lines', () => {
    let dir: string;
    let commit: string;
    ({ ws, dir, commit } = setup());
    ws.write({ [`${dir}/story.card.yaml`]: card(commit) });
    ws.write({ [SOURCE]: editLine(ws.read(SOURCE), 15) });
    ws.git('commit', '-q', '-am', 'touch cited lines');
    const { svc, summary } = scanOne(ws);
    expect(summary.drift).toBe('drifted');
    const detail = svc.detail('buy-gold-mobile');
    if (!detail.ok) throw new Error(detail.message);
    expect(detail.detail.evidence?.sources[0]).toMatchObject({ module: 'oms-core', line: 10, endLine: 20, drift: 'drifted' });
    expect(detail.detail.evidence?.repos[0].drift).toBe('drifted');
  });

  it('ignores uncommitted changes', () => {
    let dir: string;
    let commit: string;
    ({ ws, dir, commit } = setup());
    ws.write({ [`${dir}/story.card.yaml`]: card(commit) });
    ws.write({ [SOURCE]: editLine(ws.read(SOURCE), 15) }); // not committed
    expect(scanOne(ws).summary.drift).toBe('current');
  });

  it('reports missing when the cited file no longer exists at HEAD', () => {
    let dir: string;
    let commit: string;
    ({ ws, dir, commit } = setup());
    ws.write({ [`${dir}/story.card.yaml`]: card(commit) });
    ws.git('rm', '-q', SOURCE);
    ws.git('commit', '-q', '-m', 'remove');
    expect(scanOne(ws).summary.drift).toBe('missing');
  });

  it('an unknown commit is broken evidence with drift unknown', () => {
    let dir: string;
    ({ ws, dir } = setup());
    ws.write({ [`${dir}/story.card.yaml`]: card('deadbeef') });
    const { summary, svc } = scanOne(ws);
    expect(summary).toMatchObject({ drift: 'unknown', brokenEvidence: true });
    const d = svc.detail('buy-gold-mobile');
    if (!d.ok) throw new Error(d.message);
    expect(d.detail.evidence?.issues.map((i) => i.kind)).toContain('unknown-commit');
  });

  it('a human verification gives the human-verified tier; tool actors do not', () => {
    let dir: string;
    let commit: string;
    ({ ws, dir, commit } = setup());
    ws.write({ [`${dir}/story.card.yaml`]: card(commit, { verified: [{ by: 'claude-code/1.0', at: '2026-10-21T00:00:00Z' }] }) });
    expect(scanOne(ws).summary.trust).toBe('evidenced');
    ws.write({ [`${dir}/story.card.yaml`]: card(commit, { verified: [{ by: 'human:reviewer-id', at: '2026-10-21T00:00:00Z' }] }) });
    expect(scanOne(ws).summary.trust).toBe('human-verified');
  });

  it('a kb_link to a missing document is broken evidence', () => {
    let dir: string;
    let commit: string;
    ({ ws, dir, commit } = setup());
    ws.write({ [`${dir}/story.card.yaml`]: card(commit, { kb_links: ['/domain/order.md', '/requirements/use-cases/UC-OMS-001.md'] }) });
    const { summary, svc } = scanOne(ws);
    expect(summary.brokenEvidence).toBe(true);
    const d = svc.detail('buy-gold-mobile');
    if (!d.ok) throw new Error(d.message);
    expect(d.detail.evidence?.kbLinks).toEqual([
      { path: '/domain/order.md', exists: true },
      { path: '/requirements/use-cases/UC-OMS-001.md', exists: false },
    ]);
    expect(d.detail.evidence?.issues).toEqual([expect.objectContaining({ kind: 'kb-link-missing' })]);
  });

  it('builds backlinks from card kb_links and step requirement links', () => {
    let dir: string;
    let commit: string;
    ({ ws, dir, commit } = setup());
    ws.write({ [`${dir}/story.card.yaml`]: card(commit) });
    const { svc } = scanOne(ws);
    expect(svc.backlinks('/domain/order.md')).toEqual([{ id: 'buy-gold-mobile', title: 'Buy gold via mobile app' }]);
    expect(svc.backlinks('domain/order.md')).toEqual([{ id: 'buy-gold-mobile', title: 'Buy gold via mobile app' }]);
    expect(svc.backlinks('FR-001')).toEqual([{ id: 'buy-gold-mobile', title: 'Buy gold via mobile app' }]);
    expect(svc.backlinks('FR-002')).toEqual([]);
  });

  it('a git timeout leaves drift unknown and is never reported as an unknown commit', () => {
    let dir: string;
    let commit: string;
    ({ ws, dir, commit } = setup());
    ws.write({ [`${dir}/story.card.yaml`]: card(commit) });
    const evidence = new EvidenceService({ workspaceRoot: ws.root, kbPath: path.join(ws.root, 'oms-knowledge-base'), gitTimeoutMs: 1 });
    const result = evidence.evaluate({ id: 'x', evidence: { repos: [{ module: 'oms-core', commit }], sources: [{ module: 'oms-core', path: 'src/main/java/OrderCaptureService.java', line: 1 }] } });
    expect(result.drift).toBe('unknown');
    expect(result.brokenEvidence).toBe(false);
    expect(result.evidence?.issues.map((i) => i.kind)).not.toContain('unknown-commit');
  });

  it('a cardless storyboard has no evidence and drift none', () => {
    ({ ws } = setup());
    expect(scanOne(ws).summary).toMatchObject({ hasCard: false, trust: 'unevidenced', drift: 'none' });
  });
});
