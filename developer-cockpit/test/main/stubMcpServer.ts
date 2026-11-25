import * as http from 'http';

export interface StubMcpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  /** The text the stub answers a `tools/call` with. */
  reply: (args: Record<string, unknown>) => string;
}

export interface StubMcpServer {
  url: string;
  /** Every `tools/call` received, in order. */
  calls: { name: string; arguments: Record<string, unknown> }[];
  close: () => void;
}

/**
 * A minimal streamable-HTTP MCP server for tests (JSON responses, no sessions), modelled on the
 * stub in `McpToolRegistry.test.ts`, with a configurable tool list and a record of tool calls.
 */
export async function startStubMcpServer(tools: StubMcpTool[]): Promise<StubMcpServer> {
  const calls: StubMcpServer['calls'] = [];
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
      const reply = (result: unknown) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id ?? null, result }));
      };
      if (msg.method === 'initialize') {
        reply({
          protocolVersion: (msg.params as { protocolVersion?: string }).protocolVersion ?? '2025-03-26',
          capabilities: { tools: {} },
          serverInfo: { name: 'stub-mcp', version: '1.0.0' },
        });
      } else if (msg.method === 'tools/list') {
        reply({
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description ?? t.name,
            inputSchema: t.inputSchema ?? { type: 'object', properties: {} },
          })),
        });
      } else if (msg.method === 'tools/call') {
        const params = msg.params as { name: string; arguments?: Record<string, unknown> };
        const args = params.arguments ?? {};
        calls.push({ name: params.name, arguments: args });
        const tool = tools.find((t) => t.name === params.name);
        // Like oms-mcp-server (Spring AI), a call that omits a declared-required property is refused.
        const missing = ((tool?.inputSchema?.required as string[] | undefined) ?? []).filter((p) => !(p in args) || args[p] === null);
        const text = !tool
          ? `unknown tool ${params.name}`
          : missing.length
            ? `Tool (${tool.name}) input validation failed: ${missing.map((p) => `required property '${p}' not found`).join(', ')}`
            : tool.reply(args);
        reply({ content: [{ type: 'text', text }] });
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
  return { url: `http://127.0.0.1:${port}/mcp`, calls, close: () => server.close() };
}

const obj = (properties: Record<string, string>) => ({
  type: 'object',
  properties: Object.fromEntries(Object.entries(properties).map(([k, type]) => [k, { type }])),
  // Spring AI declares every parameter required unless annotated otherwise (as oms-mcp-server does today).
  required: Object.keys(properties),
  additionalProperties: false,
});

/** The knowledge server's tools with the input schemas oms-mcp-server really lists, plus one non-KB tool. */
export const KNOWLEDGE_SERVER_TOOLS: StubMcpTool[] = [
  {
    name: 'searchKnowledgeBase',
    inputSchema: obj({ query: 'string', topK: 'integer', category: 'string', status: 'string', type: 'string', tag: 'string' }),
    reply: (a) => `## Knowledge base search: "${String(a.query)}"\n### 1. \`knowledge-base/domain/concepts/order-lifecycle.md#states\``,
  },
  {
    name: 'readKnowledgeBase',
    inputSchema: obj({ path: 'string', anchor: 'string', offset: 'integer', limit: 'integer' }),
    // Like the real server: `limit` characters of the body (0 = nothing).
    reply: (a) => `## \`${String(a.path)}\`\n\n${'The order lifecycle.'.slice(0, Number(a.limit))}`,
  },
  { name: 'getKnowledgeBaseOverview', inputSchema: obj({}), reply: () => '# Overview' },
  { name: 'searchOrders', inputSchema: obj({ query: 'string' }), reply: () => '[]' },
];
