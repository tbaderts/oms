import { jsonSchema } from 'ai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { KB_SEARCH_MAX_RESULTS, type KbSearchToolResult } from '../../shared/types/ai';
import type { AiMcpServer } from '../../shared/types/config';
import type { KbSearchResult } from '../../shared/types/kb';
import { decodeToolText } from '../../shared/mcpText';

/** The KB-backed search tool's input (the AI SDK validates it via `inputSchema` during the loop). */
type KbSearchInput = { query: string };

/** `kbSearchInput` (zod) as the JSON Schema object the provider receives. */
const KB_SEARCH_INPUT_SCHEMA = {
  type: 'object',
  properties: { query: { type: 'string', minLength: 1 } },
  required: ['query'],
  additionalProperties: false,
} as const;

const MCP_CONNECT_TIMEOUT_MS = 5_000;

export interface McpTools {
  /** The run's tool set: the KB tool plus one entry per reachable MCP tool. */
  tools: Record<string, unknown>;
  /** Disconnects the MCP clients the build opened. */
  close: () => Promise<void>;
}

/**
 * A tool object in the shape the AI SDK consumes. The SDK's `tool()` helper is a runtime identity
 * function, so a plain object with `description` / `inputSchema` / `execute` is identical; using
 * the plain shape directly sidesteps `tool()`'s overloads (which fail to infer through a
 * `jsonSchema`-derived schema) while keeping the same runtime behaviour.
 */
export type ToolLike = {
  description?: string;
  inputSchema: unknown;
  execute: (input: never) => Promise<unknown>;
};

/**
 * The local `search_knowledge_base` tool backed by the cockpit's `KbService` (SPEC-0042). Shared by
 * the assistant's registry and the KB chat's local fallback (SPEC-0062).
 */
export function kbSearchTool(kb: { search: (query: string) => KbSearchResult[] }): ToolLike {
  return {
    description:
      'Search the project knowledge base (Markdown documents) for documents relevant to a query. ' +
      `Returns up to ${KB_SEARCH_MAX_RESULTS} matching documents (title, path, category, score), best first. ` +
      'score is a fuzzy-match distance: 0 is an exact match, 1 no match; lower is better.',
    // A real JSON Schema object: providers send it as the tool's input_schema, and Anthropic
    // rejects one without `type: "object"` (`kbSearchInput.shape` is zod's field map, not JSON Schema).
    inputSchema: jsonSchema(KB_SEARCH_INPUT_SCHEMA),
    execute: async (input) => {
      const q = (input as KbSearchInput).query;
      const results = kb.search(q).slice(0, KB_SEARCH_MAX_RESULTS);
      const out: KbSearchToolResult = {
        query: q,
        count: results.length,
        results: results.map((r) => ({
          title: r.document.title,
          path: r.document.relativePath,
          category: r.document.category,
          score: r.score,
        })),
      };
      return out;
    },
  };
}

/**
 * Collects the tools an AI run can use (AC-4): a local `search_knowledge_base` tool backed by the
 * cockpit's `KbService`, plus the tools of any configured MCP server (e.g. the existing
 * the knowledge server). Each MCP tool is wrapped as an AI-SDK tool whose `execute` delegates to the
 * server's `tools/call` and returns the concatenated text content.
 *
 * A server that fails to connect (bad URL, timeout, protocol error) is skipped with a log line —
 * it is never fatal to a run (design D2). With no servers configured the result is just the KB tool.
 */
export class McpToolRegistry {
  /**
   * Builds the tool set. `kb.search` may be an injected function (tests) so the KB path is proven
   * independently of the MCP path.
   */
  static async build(
    kb: { search: (query: string) => KbSearchResult[] },
    mcpServers: AiMcpServer[] = [],
    log: (msg: string) => void = console.warn,
  ): Promise<McpTools> {
    const tools: Record<string, unknown> = { search_knowledge_base: kbSearchTool(kb) };

    const clients: Client[] = [];
    for (const server of mcpServers) {
      try {
        const client = await McpToolRegistry.connect(server.url);
        const listed = await client.listTools();
        for (const t of listed.tools) {
          const name = `${server.name}:${t.name}`;
          tools[name] = McpToolRegistry.wrapMcpTool(client, server.name, t);
        }
        clients.push(client);
      } catch (err) {
        log(`[ai] MCP server "${server.name}" (${server.url}) unavailable: ${(err as Error).message}`);
      }
    }

    const close = async () => {
      await Promise.allSettled(clients.map((c) => c.close()));
    };
    return { tools, close };
  }

  /** Connects to a configured server (streamable-HTTP transport) with a short timeout. */
  static async connect(url: string): Promise<Client> {
    const transport = new StreamableHTTPClientTransport(new URL(url));
    const client = new Client({ name: 'developer-cockpit', version: '1.0.0' });
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`connect to ${url} timed out after ${MCP_CONNECT_TIMEOUT_MS}ms`)), MCP_CONNECT_TIMEOUT_MS),
    );
    try {
      await Promise.race([client.connect(transport), timeout]);
      return client;
    } catch (err) {
      await client.close().catch(() => {});
      throw err;
    }
  }

  /** Wraps one MCP tool as an AI-SDK tool; the result is the concatenated text content. */
  static wrapMcpTool(client: Client, serverName: string, t: { name: string; description?: string; inputSchema?: Record<string, unknown> }): ToolLike {
    return {
      description: t.description ?? `MCP tool ${t.name} (server: ${serverName})`,
      inputSchema: jsonSchema(t.inputSchema ?? { type: 'object', properties: {} }),
      execute: async (input) => {
        const result = await client.callTool({ name: t.name, arguments: ((input as object) ?? {}) as Record<string, unknown> });
        const content = result.content as Array<{ type?: string; text?: string }> | undefined;
        // A text that arrives JSON-encoded (quoted, escaped breaks) is decoded first (SPEC-0065).
        const text = (content ?? []).filter((c) => c.type === 'text').map((c) => decodeToolText(c.text ?? '')).join('\n');
        return text || '(no text content)';
      },
    };
  }
}
