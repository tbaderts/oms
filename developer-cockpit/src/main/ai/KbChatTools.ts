import { jsonSchema } from 'ai';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { KbChatToolSource } from '../../shared/types/ai';
import type { KbDocument, KbSearchResult } from '../../shared/types/kb';
import { normaliseKbPath } from '../../shared/kbPath';
import { McpToolRegistry, kbSearchTool, type ToolLike } from './McpToolRegistry';

/**
 * The knowledge-server protocol: the MCP tools the KB chat uses (README → "Knowledge server").
 * Anything else a server exposes is left out (D2).
 */
export const KB_TOOL_NAMES = ['searchKnowledgeBase', 'readKnowledgeBase', 'getKnowledgeBaseOverview'] as const;

/**
 * The parameters the KB tools really need. Some MCP servers (e.g. ones built with Spring AI) declare
 * every parameter required but treat all but these as optional, so the model is asked only for
 * these and the rest are filled with neutral values (see `neutralValue`).
 */
const KB_TOOL_REQUIRED: Record<string, string[]> = {
  searchKnowledgeBase: ['query'],
  readKnowledgeBase: ['path'],
  getKnowledgeBaseOverview: [],
};

/** A local read returns at most this many characters of a document's body. */
export const MAX_READ_CHARS = 20_000;

/**
 * `readKnowledgeBase`'s `limit` when the model sets none (or a non-positive one): the same bound as
 * a local read, so one read cannot flood the context. A longer document ends with the server's
 * "call again with offset=…" hint, and the model can page.
 */
export const DEFAULT_READ_LIMIT = MAX_READ_CHARS;

const OUTSIDE_KB = 'Error: path must be inside the knowledge base.';

export interface KbChatKb {
  search: (query: string) => KbSearchResult[];
  getDocument: (path: string) => KbDocument | undefined;
}

export interface KbChatToolSet {
  tools: Record<string, unknown>;
  source: KbChatToolSource;
  close: () => Promise<void>;
}

/**
 * The KB chat's tool set (SPEC-0062): the knowledge server's KB tools over MCP when it is
 * reachable (AC-2), else local KB search and read tools (AC-3). Building never throws.
 */
export class KbChatTools {
  static async build(url: string | undefined, kb: KbChatKb, log: (msg: string) => void = console.warn): Promise<KbChatToolSet> {
    let client: Client | null = null;
    try {
      if (!url || !/^https?:\/\//i.test(url)) throw new Error('not an http(s) URL');
      client = await McpToolRegistry.connect(url);
      const listed = await client.listTools();
      const tools: Record<string, unknown> = {};
      for (const t of listed.tools) {
        if ((KB_TOOL_NAMES as readonly string[]).includes(t.name)) tools[t.name] = kbServerTool(client, t);
      }
      if (Object.keys(tools).length === 0) throw new Error('the server exposes none of the KB tools');
      const connected = client;
      return { tools, source: 'knowledge-server', close: async () => connected.close().catch(() => {}) };
    } catch (err) {
      await client?.close().catch(() => {});
      log(`[kb-chat] knowledge server ${url ?? '(not set)'} unavailable, using local tools: ${(err as Error).message}`);
      return {
        tools: { search_knowledge_base: kbSearchTool(kb), read_knowledge_base_document: localReadTool(kb) },
        source: 'local',
        close: async () => {},
      };
    }
  }
}

type McpToolInfo = { name: string; description?: string; inputSchema?: Record<string, unknown> };
type JsonSchemaObject = { properties?: Record<string, { type?: string }>; required?: string[] } & Record<string, unknown>;

/**
 * One knowledge-server KB tool for the model. The schema shown to the model requires only the
 * parameters in KB_TOOL_REQUIRED; on a call, every other parameter the server declares required
 * and the model left out is filled with a neutral value, so the server's validation passes and the
 * result is what "not set" means to it (e.g. the start of the document, the default topK).
 */
function kbServerTool(client: Client, t: McpToolInfo): ToolLike {
  const schema = (t.inputSchema ?? { type: 'object', properties: {} }) as JsonSchemaObject;
  const properties = schema.properties ?? {};
  const serverRequired = schema.required ?? [];
  const modelRequired = (KB_TOOL_REQUIRED[t.name] ?? serverRequired).filter((p) => p in properties);
  const base = McpToolRegistry.wrapMcpTool(client, 'knowledge-server', { ...t, inputSchema: { ...schema, required: modelRequired } });
  return {
    ...base,
    execute: async (input) => {
      const args: Record<string, unknown> = { ...((input as object) ?? {}) };
      // A non-positive limit would return an empty body; it counts as "not set".
      if (typeof args.limit === 'number' && args.limit <= 0) delete args.limit;
      for (const p of serverRequired) {
        if (args[p] === undefined || args[p] === null) {
          const v = neutralValue(p, properties[p]?.type);
          if (v !== undefined) args[p] = v;
        }
      }
      return base.execute(args as never);
    },
  };
}

/** What the knowledge server reads as "not set" for a parameter (its code checks hasText / null / <= 0). */
function neutralValue(name: string, type: string | undefined): unknown {
  if (name === 'limit') return DEFAULT_READ_LIMIT;
  switch (type) {
    case 'string':
      return '';
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return false;
    default:
      return undefined;
  }
}

/** Reads one indexed KB document by path; never reads outside the knowledge base (AC-3, P-16). */
export function localReadTool(kb: Pick<KbChatKb, 'getDocument'>): ToolLike {
  return {
    description:
      'Read a knowledge base document by its path (as returned by search_knowledge_base, e.g. ' +
      "'guides/getting-started.md'). Returns its title, path and Markdown content.",
    inputSchema: jsonSchema({ type: 'object', properties: { path: { type: 'string', minLength: 1 } }, required: ['path'] }),
    execute: async (input) => {
      const raw = String((input as { path?: unknown }).path ?? '');
      if (isOutside(raw)) return OUTSIDE_KB;
      const path = normaliseKbPath(raw);
      const doc = kb.getDocument(path);
      if (!doc) return `Error: no document at ${path}.`;
      const body = doc.content.length > MAX_READ_CHARS ? `${doc.content.slice(0, MAX_READ_CHARS)}\n… (truncated)` : doc.content;
      return `# ${doc.title}\npath: ${doc.relativePath}\n\n${body}`;
    },
  };
}

function isOutside(raw: string): boolean {
  const p = raw.trim().replace(/\\/g, '/');
  if (p.startsWith('/') || /^[a-zA-Z]:/.test(p)) return true;
  return p.split('/').some((seg) => seg === '..');
}
