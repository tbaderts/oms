// kbChatTrace.test.ts - Source details and run summaries from a KB chat run's trace (SPEC-0065).
import { describe, expect, it } from 'vitest';
import {
  parseLocalSearch,
  parseServerSearch,
  sourceDetails,
  summarise,
  type KbChatStep,
  type KbChatTrace,
} from '../../src/renderer/lib/kbChatTrace';

/** Knowledge server search output, as `KnowledgeBaseTools.searchKnowledgeBase` writes it. */
const SERVER_SEARCH = [
  '## Knowledge base search: "cancel"',
  'Mode: hybrid (BM25 + semantic, rank-fused) — 3 of 7 matching sections',
  '',
  '### 1. `knowledge-base/domain/concepts/order-lifecycle.md#cancellation`',
  '**Order Lifecycle › Cancellation** (lines 40-58) — Domain Concept · stable · human-reviewed — score 0.0325 · keyword #1 · semantic #2',
  '',
  '> A cancel request moves the order to PendingCancel.',
  '> The exchange confirms it.',
  '',
  '### 2. `knowledge-base/domain/model/order-state.md#transitions`',
  '**Order State › Transitions** (lines 10-30) — score 0.0161 · keyword #3',
  '',
  '> Transitions in force.',
  '',
  '### 3. `knowledge-base/domain/concepts/order-lifecycle.md#states`',
  '**Order Lifecycle › States** (lines 5-20) — Domain Concept · stable · human-reviewed — score 0.0159 · semantic #1',
  '',
  '> The states of an order.',
  '',
  '_4 further matching sections — refine the query or raise topK (max 20)._',
  '',
  'To read any result in full: `readKnowledgeBase(path, anchor)`.',
].join('\n');

const tool = (name: string, input: Record<string, unknown>, output?: string, id = name): KbChatStep =>
  ({ kind: 'tool', toolCallId: id, name, input, output });

describe('parseServerSearch (SPEC-0065, AC-1)', () => {
  it('parses knowledge server hits', () => {
    const hits = parseServerSearch(SERVER_SEARCH);
    expect(hits).toHaveLength(3);
    expect(hits[0]).toEqual({
      rank: 1,
      path: 'domain/concepts/order-lifecycle.md',
      anchor: 'cancellation',
      breadcrumb: 'Order Lifecycle › Cancellation',
      lines: '40-58',
      facets: 'Domain Concept · stable · human-reviewed',
      score: 0.0325,
      keywordRank: 1,
      semanticRank: 2,
      excerpt: 'A cancel request moves the order to PendingCancel.\nThe exchange confirms it.',
    });
    // No facets, no semantic rank.
    expect(hits[1]).toMatchObject({ rank: 2, facets: undefined, score: 0.0161, keywordRank: 3, semanticRank: undefined });
    expect(hits[2]).toMatchObject({ rank: 3, keywordRank: undefined, semanticRank: 1 });
  });

  it('keeps what it can of a hit cut off by the output bound, and reads output without scores', () => {
    const cut = `${SERVER_SEARCH.slice(0, SERVER_SEARCH.indexOf('(lines 10-30)') + 5)}… (truncated)`;
    const hits = parseServerSearch(cut);
    expect(hits).toHaveLength(2);
    expect(hits[1]).toMatchObject({ rank: 2, path: 'domain/model/order-state.md', anchor: 'transitions', breadcrumb: 'Order State › Transitions' });
    expect(hits[1].score).toBeUndefined();

    const old = SERVER_SEARCH.replace(/ — score [^\n]*/g, '');
    expect(parseServerSearch(old)[0]).toMatchObject({ facets: 'Domain Concept · stable · human-reviewed', score: undefined });
    expect(parseServerSearch('No matches.')).toEqual([]);
  });

  it('parses the running server output, which arrived JSON-encoded (AC-10)', () => {
    // Captured from the knowledge server before SPEC-0065: Spring AI sent the Markdown as a JSON string.
    const markdown = [
      '## Knowledge base search: "cancel order"',
      'Mode: hybrid (BM25 + semantic, rank-fused) — 2 of 72 matching sections',
      '',
      '### 1. `knowledge-base/capabilities/order-cancellation.md#summary`',
      '**order-cancellation.md > Order Cancellation > Summary** (lines 18-28) — Capability · draft · unverified',
      '',
      '> ## Summary',
      '> ',
      '> A client can ask to cancel the open quantity of a working order.',
      '',
    ].join('\n');
    const hits = parseServerSearch(JSON.stringify(markdown));
    expect(hits).toEqual([expect.objectContaining({
      rank: 1,
      path: 'capabilities/order-cancellation.md',
      anchor: 'summary',
      breadcrumb: 'order-cancellation.md > Order Cancellation > Summary',
      lines: '18-28',
      facets: 'Capability · draft · unverified',
      score: undefined,
    })]);
    expect(hits[0].excerpt).toContain('A client can ask to cancel');
  });
});

describe('parseLocalSearch (SPEC-0065, AC-2)', () => {
  it('parses local search results', () => {
    const out = JSON.stringify({
      query: 'order',
      count: 2,
      results: [
        { title: 'Order', path: 'domain/model/order.md', category: 'domain', score: 4.5 },
        { title: 'Fill', path: 'domain/model/execution.md', category: 'domain' },
      ],
    });
    expect(parseLocalSearch(out)).toEqual([
      { rank: 1, path: 'domain/model/order.md', title: 'Order', category: 'domain', score: 4.5 },
      { rank: 2, path: 'domain/model/execution.md', title: 'Fill', category: 'domain', score: undefined },
    ]);
    expect(parseLocalSearch(`${out.slice(0, 40)}… (truncated)`)).toEqual([]);
  });
});

describe('sourceDetails (SPEC-0065)', () => {
  it('source details per document from searches (AC-1)', () => {
    const details = sourceDetails([
      { kind: 'text', text: 'Let me search.' },
      tool('searchKnowledgeBase', { query: 'cancel' }, SERVER_SEARCH),
    ]);
    expect(details.map((d) => d.path)).toEqual(['domain/concepts/order-lifecycle.md', 'domain/model/order-state.md']);
    expect(details[0].matches).toEqual([
      expect.objectContaining({ kind: 'search', tool: 'searchKnowledgeBase', query: 'cancel', rank: 1, anchor: 'cancellation', score: 0.0325 }),
      expect.objectContaining({ kind: 'search', query: 'cancel', rank: 3, anchor: 'states', semanticRank: 1 }),
    ]);
  });

  it('a knowledge server read is a read match with its anchor (AC-3)', () => {
    const details = sourceDetails([
      tool('readKnowledgeBase', { path: 'knowledge-base/domain/model/order-state.md', anchor: 'transitions' }, '## `x`'),
      tool('readKnowledgeBase', { path: 'domain/model/order.md' }),
    ]);
    expect(details).toEqual([
      { path: 'domain/model/order-state.md', matches: [{ kind: 'read', tool: 'readKnowledgeBase', anchor: 'transitions' }] },
      { path: 'domain/model/order.md', matches: [{ kind: 'read', tool: 'readKnowledgeBase', anchor: undefined }] },
    ]);
  });

  it('local search and read matches (AC-2)', () => {
    const details = sourceDetails([
      tool('search_knowledge_base', { query: 'order' }, JSON.stringify({ query: 'order', count: 1, results: [{ title: 'Order', path: 'domain/model/order.md', category: 'domain', score: 2 }] })),
      tool('read_knowledge_base_document', { path: 'tools/developer-cockpit.md' }, '# Developer Cockpit'),
      tool('stub:greet', { name: 'x' }, 'knowledge-base/ignored.md'),
    ]);
    expect(details).toEqual([
      { path: 'domain/model/order.md', matches: [{ kind: 'search', tool: 'search_knowledge_base', query: 'order', rank: 1, score: 2, category: 'domain' }] },
      { path: 'tools/developer-cockpit.md', matches: [{ kind: 'read', tool: 'read_knowledge_base_document', anchor: undefined }] },
    ]);
  });

  it('accepts server tool names with a server prefix, and ignores a search still running', () => {
    expect(sourceDetails([tool('oms:searchKnowledgeBase', { query: 'q' }, SERVER_SEARCH)])).toHaveLength(2);
    expect(sourceDetails([tool('searchKnowledgeBase', { query: 'q' })])).toEqual([]);
  });
});

describe('summarise (SPEC-0065, AC-5)', () => {
  it('steps keep text and tool calls in order; the summary counts calls, duration and tokens', () => {
    const trace: KbChatTrace = {
      steps: [{ kind: 'text', text: 'a' }, tool('searchKnowledgeBase', { query: 'q' }, 'x', 'c1'), { kind: 'text', text: 'b' }, tool('readKnowledgeBase', { path: 'a.md' }, 'y', 'c2')],
      startedAt: 1_000,
      endedAt: 3_500,
      usage: { inputTokens: 1200, outputTokens: 300 },
      outcome: 'complete',
    };
    expect(trace.steps.map((s) => s.kind)).toEqual(['text', 'tool', 'text', 'tool']);
    expect(summarise(trace)).toEqual({ toolCalls: 2, durationMs: 2500, totalTokens: 1500 });
    expect(summarise({ ...trace, endedAt: undefined, usage: undefined })).toEqual({ toolCalls: 2, durationMs: undefined, totalTokens: undefined });
  });
});
