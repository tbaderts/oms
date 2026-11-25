import { afterEach, describe, expect, it } from 'vitest';
import { KbChatTools, DEFAULT_READ_LIMIT, MAX_READ_CHARS, type KbChatToolSet } from '../../src/main/ai/KbChatTools';
import type { KbDocument } from '../../src/shared/types/kb';
import { KNOWLEDGE_SERVER_TOOLS, startStubMcpServer, type StubMcpServer } from './stubMcpServer';

const doc = (relPath: string, content: string): KbDocument => ({
  path: `/kb/${relPath}`,
  relativePath: relPath,
  title: relPath,
  category: relPath.split('/')[0],
  folder: relPath.split('/').slice(0, -1).join('/'),
  content,
  frontmatter: {},
  lastModified: 0,
});

const docs = [doc('domain/concepts/order-lifecycle.md', 'Orders move from NEW to FILLED.')];
const kb = {
  search: () => [],
  getDocument: (p: string) => docs.find((d) => d.relativePath === p),
};

type Exec = { execute: (input: Record<string, unknown>) => Promise<unknown> };

let stub: StubMcpServer | null = null;
let built: KbChatToolSet | null = null;
afterEach(async () => {
  await built?.close();
  built = null;
  stub?.close();
  stub = null;
});

describe('KbChatTools — knowledge server (AC-2)', () => {
  it('keeps only the knowledge-server KB tools', async () => {
    stub = await startStubMcpServer(KNOWLEDGE_SERVER_TOOLS);
    built = await KbChatTools.build(stub.url, kb, () => {});
    expect(built.source).toBe('knowledge-server');
    expect(Object.keys(built.tools).sort()).toEqual(['getKnowledgeBaseOverview', 'readKnowledgeBase', 'searchKnowledgeBase']);
  });

  it('forwards a tool call to the server', async () => {
    stub = await startStubMcpServer(KNOWLEDGE_SERVER_TOOLS);
    built = await KbChatTools.build(stub.url, kb, () => {});
    const out = await (built.tools.readKnowledgeBase as Exec).execute({ path: 'knowledge-base/domain/concepts/order-lifecycle.md' });
    // The server's other declared-required parameters are filled with neutral values: a bounded read from the start.
    expect(stub.calls).toEqual([
      { name: 'readKnowledgeBase', arguments: { path: 'knowledge-base/domain/concepts/order-lifecycle.md', anchor: '', offset: 0, limit: DEFAULT_READ_LIMIT } },
    ]);
    expect(out).toContain('The order lifecycle.');
  });

  it('asks the model only for the parameters that matter, and keeps what it sends', async () => {
    stub = await startStubMcpServer(KNOWLEDGE_SERVER_TOOLS);
    built = await KbChatTools.build(stub.url, kb, () => {});
    const schema = (name: string) => (built!.tools[name] as { inputSchema: { jsonSchema: { required: string[]; properties: object } } }).inputSchema.jsonSchema;
    expect(schema('searchKnowledgeBase').required).toEqual(['query']);
    expect(Object.keys(schema('searchKnowledgeBase').properties)).toEqual(['query', 'topK', 'category', 'status', 'type', 'tag']);
    expect(schema('readKnowledgeBase').required).toEqual(['path']);
    expect(schema('getKnowledgeBaseOverview').required).toEqual([]);

    await (built.tools.searchKnowledgeBase as Exec).execute({ query: 'fills', category: 'domain' });
    expect(stub.calls.at(-1)).toEqual({
      name: 'searchKnowledgeBase',
      arguments: { query: 'fills', category: 'domain', topK: 0, status: '', type: '', tag: '' },
    });
  });

  it('bounds a read: an explicit limit <= 0 counts as unset, a positive limit is kept', async () => {
    stub = await startStubMcpServer(KNOWLEDGE_SERVER_TOOLS);
    built = await KbChatTools.build(stub.url, kb, () => {});
    const read = built.tools.readKnowledgeBase as Exec;
    expect(DEFAULT_READ_LIMIT).toBe(MAX_READ_CHARS);
    await read.execute({ path: 'a.md', limit: 0 });
    await read.execute({ path: 'a.md', limit: 500, offset: 1000 });
    expect(stub.calls.map((c) => [c.arguments.limit, c.arguments.offset])).toEqual([
      [DEFAULT_READ_LIMIT, 0],
      [500, 1000],
    ]);
  });
});

describe('KbChatTools — local fallback (AC-3)', () => {
  it('falls back to local tools when the server is unreachable', async () => {
    const logs: string[] = [];
    built = await KbChatTools.build('http://127.0.0.1:1/mcp', kb, (m) => logs.push(m));
    expect(built.source).toBe('local');
    expect(Object.keys(built.tools).sort()).toEqual(['read_knowledge_base_document', 'search_knowledge_base']);
    expect(logs.some((l) => l.includes('[kb-chat]') && l.includes('127.0.0.1:1'))).toBe(true);
  });

  it('falls back to local tools for an invalid URL or a server without KB tools', async () => {
    built = await KbChatTools.build('ftp://example', kb, () => {});
    expect(built.source).toBe('local');
    await built.close();

    stub = await startStubMcpServer([{ name: 'searchOrders', reply: () => '[]' }]);
    built = await KbChatTools.build(stub.url, kb, () => {});
    expect(built.source).toBe('local');
  });

  it('local read returns document content', async () => {
    built = await KbChatTools.build('http://127.0.0.1:1/mcp', kb, () => {});
    const read = built.tools.read_knowledge_base_document as Exec;
    const out = String(await read.execute({ path: 'knowledge-base/domain/concepts/order-lifecycle.md#states' }));
    expect(out).toContain('domain/concepts/order-lifecycle.md');
    expect(out).toContain('Orders move from NEW to FILLED.');
    expect(String(await read.execute({ path: 'domain/missing.md' }))).toBe('Error: no document at domain/missing.md.');
  });

  it('local read refuses paths outside the KB', async () => {
    built = await KbChatTools.build('http://127.0.0.1:1/mcp', kb, () => {});
    const read = built.tools.read_knowledge_base_document as Exec;
    const refusal = 'Error: path must be inside the knowledge base.';
    expect(await read.execute({ path: '../secret.md' })).toBe(refusal);
    expect(await read.execute({ path: 'domain/../../secret.md' })).toBe(refusal);
    expect(await read.execute({ path: 'C:/Windows/win.ini' })).toBe(refusal);
    expect(await read.execute({ path: '/etc/passwd' })).toBe(refusal);
  });
});
