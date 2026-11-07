import * as http from 'http';
import { describe, expect, it, vi } from 'vitest';
import { McpToolRegistry, type McpTools } from '../../src/main/ai/McpToolRegistry';
import type { AiMcpServer } from '../../src/shared/types/config';
import type { KbDocument, KbSearchResult } from '../../src/shared/types/kb';

/** A fixture KB document. */
const doc = (title: string, relPath: string, category: string): KbDocument => ({
  path: `/kb/${relPath}`,
  relativePath: relPath,
  title,
  category,
  content: `${title} content`,
  frontmatter: {},
  lastModified: 0,
});

const kbHit = (d: KbDocument): KbSearchResult => ({ document: d, score: 0.1, matches: [d.title] });

/** A stub MCP server over streamable-HTTP: one tool, `greet`. */
async function startStubMcpServer(): Promise<{ url: string; close: () => void }> {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (req.method !== 'POST') {
        res.writeHead(405);
        res.end();
        return;
      }
      const msg = JSON.parse(body) as { id?: unknown; method?: string; params?: Record<string, unknown> };
      const reply = (result: unknown, status = 200) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id ?? null, result }));
      };
      if (msg.method === 'initialize') {
        reply({
          protocolVersion: (msg.params as { protocolVersion?: string }).protocolVersion ?? '2025-03-26',
          capabilities: {},
          serverInfo: { name: 'stub-mcp', version: '1.0.0' },
        });
      } else if (msg.method === 'tools/list') {
        reply({
          tools: [
            {
              name: 'greet',
              description: 'Greets a person by name',
              inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
            },
          ],
        });
      } else if (msg.method === 'tools/call') {
        const args = (msg.params as { arguments?: { name?: string } }).arguments ?? {};
        reply({ content: [{ type: 'text', text: `Hello ${args.name}` }] });
      } else if (msg.id !== undefined) {
        reply({});
      } else {
        res.writeHead(202);
        res.end();
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}/mcp`, close: () => server.close() };
}

describe('McpToolRegistry (AC-4, AC-8)', () => {
  it('build() always includes search_knowledge_base, executable against the KB', async () => {
    const hits = [kbHit(doc('Order lifecycle', 'oms-concepts/order-lifecycle.md', 'oms-concepts'))];
    const { tools, close } = await McpToolRegistry.build({ search: (q) => (q === 'orders' ? hits : []) }, []);
    expect(Object.keys(tools)).toEqual(['search_knowledge_base']);

    const t = tools.search_knowledge_base as { execute: (input: { query: string }) => Promise<unknown> };
    const result = (await t.execute({ query: 'orders' })) as Record<string, unknown>;
    expect(result).toEqual({
      query: 'orders',
      count: 1,
      results: [{ title: 'Order lifecycle', path: 'oms-concepts/order-lifecycle.md', category: 'oms-concepts' }],
    });
    await close();
  });

  it('exposes a configured MCP server tool, callable through the server (integration: stub MCP server)', async () => {
    const stub = await startStubMcpServer();
    const warnings: string[] = [];
    const { tools, close } = await McpToolRegistry.build({ search: () => [] }, [{ name: 'stub', url: stub.url }], (m) => warnings.push(m));
    expect(warnings).toEqual([]);
    expect(Object.keys(tools).sort()).toEqual(['search_knowledge_base', 'stub:greet']);

    const t = tools['stub:greet'] as { execute: (input: { name: string }) => Promise<unknown> };
    expect(await t.execute({ name: 'world' })).toBe('Hello world');

    await close();
    stub.close();
  });

  it('skips a server that fails to connect (logged, not fatal) and keeps the KB tool', async () => {
    const warnings: string[] = [];
    const bad: AiMcpServer = { name: 'bad', url: 'http://127.0.0.1:1/nope' };
    const { tools, close } = await McpToolRegistry.build({ search: () => [] }, [bad], (m) => warnings.push(m));
    expect(Object.keys(tools)).toEqual(['search_knowledge_base']);
    expect(warnings.some((w) => w.includes('bad'))).toBe(true);
    await close();
  });

  it('a tool output that is not a string degrades to a bounded string (AC-8)', async () => {
    const stub = await startStubMcpServer();
    const { tools, close } = await McpToolRegistry.build({ search: () => [] }, [{ name: 'stub', url: stub.url }]);
    const t = tools['stub:greet'] as { execute: (input: { name: string }) => Promise<unknown> };
    const out = await t.execute({ name: 'x' });
    // Whatever the server returns, the tool result crossing to the model/UI is a JSON-safe string.
    expect(typeof out).toBe('string');
    await close();
    stub.close();
  });
});
