import { describe, expect, it } from 'vitest';
import { extractSources } from '../../src/renderer/lib/kbChatSources';
import { normaliseKbPath } from '../../src/shared/kbPath';

describe('normaliseKbPath (SPEC-0062)', () => {
  it('strips the bundle prefix, an anchor and leading slashes, and unifies separators', () => {
    expect(normaliseKbPath('knowledge-base/domain/model/order.md#states')).toBe('domain/model/order.md');
    expect(normaliseKbPath('/domain\\concepts\\x.md')).toBe('domain/concepts/x.md');
    expect(normaliseKbPath('  tools/developer-cockpit.md  ')).toBe('tools/developer-cockpit.md');
  });
});

describe('extractSources (AC-4)', () => {
  it('extracts and de-duplicates sources from search output, read inputs and local JSON output', () => {
    const searchMd = [
      '## Knowledge base search: "lifecycle"',
      '### 1. `knowledge-base/domain/concepts/order-lifecycle.md#states`',
      '### 2. `knowledge-base/domain/model/order-state.md#transitions`',
      '### 3. `knowledge-base/domain/concepts/order-lifecycle.md#cancel`',
    ].join('\n');
    const sources = extractSources([
      { type: 'ai:tool-call', name: 'searchKnowledgeBase', input: { query: 'lifecycle' } },
      { type: 'ai:tool-result', name: 'searchKnowledgeBase', output: searchMd },
      { type: 'ai:tool-call', name: 'readKnowledgeBase', input: { path: 'knowledge-base/domain/model/order-state.md' } },
      { type: 'ai:tool-call', name: 'read_knowledge_base_document', input: { path: 'tools/developer-cockpit.md' } },
      {
        type: 'ai:tool-result',
        name: 'search_knowledge_base',
        output: JSON.stringify({ query: 'x', count: 2, results: [{ title: 'A', path: 'architecture/a.md', category: 'architecture' }, { title: 'B', path: 'tools/developer-cockpit.md', category: 'tools' }] }),
      },
    ]);
    expect(sources).toEqual([
      'domain/concepts/order-lifecycle.md',
      'domain/model/order-state.md',
      'tools/developer-cockpit.md',
      'architecture/a.md',
    ]);
  });

  it('ignores non-Markdown paths, unrelated inputs and message events', () => {
    expect(
      extractSources([
        { type: 'ai:tool-call', name: 'readKnowledgeBase', input: { path: 'images/diagram.png' } },
        { type: 'ai:tool-result', name: 'getKnowledgeBaseOverview', output: 'see https://example.com/a.md and `build/x.txt`' },
        { type: 'ai:message', text: 'knowledge-base/domain/x.md' },
      ]),
    ).toEqual([]);
  });
});

describe('configured knowledge-base prefix (SPEC-0076)', () => {
  it('strips and finds citations under the configured root', async () => {
    const { setKbBundlePrefix } = await import('../../src/shared/kbPath');
    setKbBundlePrefix('./handbook/');
    try {
      expect(normaliseKbPath('handbook/guide/setup.md#install')).toBe('guide/setup.md');
      expect(extractSources([{ type: 'ai:tool-result', output: '### 1. `handbook/guide/setup.md#install`\n`knowledge-base/other.md`' }])).toEqual(['guide/setup.md']);
    } finally {
      setKbBundlePrefix('knowledge-base');
    }
  });
});
