import { isKbDocumentPath, normaliseKbPath } from '@shared/kbPath';
import { decodeToolText } from '@shared/mcpText';

/**
 * A KB chat run's trace (SPEC-0065): what the model wrote and which tools it called, in order, plus
 * the run's model, usage, outcome and timing. Built by the kbChat store from the `ai:*` events it
 * already receives; read here into the "Source details" and "Run details" of an answer.
 */
export type KbChatStep =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; toolCallId: string; name: string; input: Record<string, unknown>; output?: string };

export type KbChatOutcome = 'running' | 'complete' | 'stopped' | 'step-limit' | 'failed';

export interface KbChatTrace {
  steps: KbChatStep[];
  startedAt: number;
  endedAt?: number;
  model?: { provider: string; model: string };
  usage?: { inputTokens: number; outputTokens: number };
  outcome: KbChatOutcome;
  error?: string;
}

/** One hit of the knowledge server's `searchKnowledgeBase` output; fields cut off by the output bound are undefined. */
export interface ServerHit {
  rank: number;
  path: string;
  anchor?: string;
  breadcrumb?: string;
  lines?: string;
  facets?: string;
  score?: number;
  keywordRank?: number;
  semanticRank?: number;
  excerpt?: string;
}

/** One result of the cockpit's local `search_knowledge_base` tool. */
export interface LocalHit {
  rank: number;
  path: string;
  title?: string;
  category?: string;
  score?: number;
}

/** Why a document is a source of an answer: a search found it, or the model read it. */
export type SourceMatch =
  | ({ kind: 'search'; tool: string; query?: string } & Omit<ServerHit, 'path'>)
  | { kind: 'search'; tool: string; query?: string; rank: number; score?: number; category?: string }
  | { kind: 'read'; tool: string; anchor?: string };

export interface SourceDetail {
  path: string;
  matches: SourceMatch[];
}

const HIT_HEADING = /^### (\d+)\. `([^`]+)`\s*$/gm;
const num = (s: string | undefined) => (s === undefined ? undefined : Number(s));

/** Hits of the knowledge server's Markdown search output, tolerating missing and truncated parts. */
export function parseServerSearch(raw: string): ServerHit[] {
  // A second guard: the main process already decodes JSON-encoded tool text (SPEC-0065, AC-10).
  const output = decodeToolText(raw);
  const heads = [...output.matchAll(HIT_HEADING)];
  return heads.map((m, i) => {
    const block = output.slice(m.index! + m[0].length, i + 1 < heads.length ? heads[i + 1].index : undefined);
    const citation = m[2];
    const hash = citation.indexOf('#');
    const hit: ServerHit = {
      rank: Number(m[1]),
      path: normaliseKbPath(citation),
      anchor: hash >= 0 ? citation.slice(hash + 1) || undefined : undefined,
    };
    const line = block.split(/\r?\n/).find((l) => l.startsWith('**'));
    if (line) {
      hit.breadcrumb = /^\*\*(.+?)\*\*/.exec(line)?.[1];
      hit.lines = /\(lines (\d+-\d+)\)/.exec(line)?.[1];
      // "… (lines a-b)[ — facets][ — score x · keyword #k · semantic #s]"
      const parts = line.replace(/^\*\*.+?\*\*(\s*\(lines [^)]*\))?/, '').split(' — ').map((p) => p.trim()).filter(Boolean);
      const scorePart = parts.find((p) => p.startsWith('score '));
      hit.facets = parts.find((p) => !p.startsWith('score ')) || undefined;
      // Output from a server before SPEC-0065 has no score part: the fields stay undefined.
      hit.score = num(scorePart && /score ([\d.]+)/.exec(scorePart)?.[1]);
      hit.keywordRank = num(scorePart && /keyword #(\d+)/.exec(scorePart)?.[1]);
      hit.semanticRank = num(scorePart && /semantic #(\d+)/.exec(scorePart)?.[1]);
    }
    const quoted = block.split(/\r?\n/).filter((l) => l.startsWith('>')).map((l) => l.replace(/^> ?/, ''));
    if (quoted.length) hit.excerpt = quoted.join('\n');
    return hit;
  });
}

/** Results of the local search tool's JSON output; truncated or invalid output gives none. */
export function parseLocalSearch(output: string): LocalHit[] {
  try {
    const parsed = JSON.parse(output) as { results?: { path?: unknown; title?: unknown; category?: unknown; score?: unknown }[] };
    if (!Array.isArray(parsed.results)) return [];
    return parsed.results
      .map((r, i) => ({
        rank: i + 1,
        path: typeof r.path === 'string' ? normaliseKbPath(r.path) : '',
        title: typeof r.title === 'string' ? r.title : undefined,
        category: typeof r.category === 'string' ? r.category : undefined,
        score: typeof r.score === 'number' ? r.score : undefined,
      }))
      .filter((r) => r.path);
  } catch {
    return [];
  }
}

/** The tool's own name, without an MCP server prefix (`kb:searchKnowledgeBase` → `searchKnowledgeBase`). */
const baseName = (name: string) => name.slice(name.lastIndexOf(':') + 1);
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

/** Every document the run's search and read tools touched, in first-seen order, with why (AC-1 to AC-3). */
export function sourceDetails(steps: KbChatStep[]): SourceDetail[] {
  const byPath = new Map<string, SourceMatch[]>();
  const add = (rawPath: string, match: SourceMatch) => {
    const path = normaliseKbPath(rawPath);
    if (!path || !isKbDocumentPath(path)) return;
    if (!byPath.has(path)) byPath.set(path, []);
    byPath.get(path)!.push(match);
  };

  for (const step of steps) {
    if (step.kind !== 'tool') continue;
    const name = baseName(step.name);
    const query = str(step.input.query);
    if (name === 'searchKnowledgeBase' && step.output) {
      for (const { path, ...hit } of parseServerSearch(step.output)) add(path, { kind: 'search', tool: step.name, query, ...hit });
    } else if (name === 'search_knowledge_base' && step.output) {
      for (const hit of parseLocalSearch(step.output)) {
        add(hit.path, { kind: 'search', tool: step.name, query, rank: hit.rank, score: hit.score, category: hit.category });
      }
    } else if ((name === 'readKnowledgeBase' || name === 'read_knowledge_base_document') && str(step.input.path)) {
      add(String(step.input.path), { kind: 'read', tool: step.name, anchor: str(step.input.anchor) });
    }
  }
  return [...byPath].map(([path, matches]) => ({ path, matches }));
}

/** The numbers on the run summary line (AC-5). */
export function summarise(trace: KbChatTrace): { toolCalls: number; durationMs?: number; totalTokens?: number } {
  return {
    toolCalls: trace.steps.filter((s) => s.kind === 'tool').length,
    durationMs: trace.endedAt === undefined ? undefined : trace.endedAt - trace.startedAt,
    totalTokens: trace.usage ? trace.usage.inputTokens + trace.usage.outputTokens : undefined,
  };
}
