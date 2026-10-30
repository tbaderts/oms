import type { AiConfig } from '../../shared/types/config';
import {
  LINK_CATEGORIES,
  type AiAssistKind,
  type AiProposal,
  type ContinueAt,
  type LinkIndex,
  type Step,
  type StoryboardDetail,
  type StoryboardResult,
} from '../../shared/types/storyboards';
import type { AiAdapter } from './ai/AiAdapter';
import type { StoryboardService } from './StoryboardService';

/** Upper bound for the user prompt of any assist; extracts are cut first. */
export const MAX_CONTEXT_CHARS = 12_000;
const MAX_EXTRACTS = 3;
const MAX_EXTRACT_CHARS = 2_000;
const MAX_INDEX_CHARS = 6_000;

export function aiAvailable(config: AiConfig, env: NodeJS.ProcessEnv = process.env): boolean {
  return config.provider === 'anthropic' && !!env[config.apiKeyEnvVar];
}

export interface StoryboardAiOptions {
  adapter: AiAdapter;
  storyboards: StoryboardService;
  linkIndex: { get(): LinkIndex };
  /** Bounded text of a linked requirement id or knowledge-base document, or null. Supplied by the caller. */
  extract: (ref: string) => string | null;
}

const SYSTEM = [
  'You help business analysts document an order management system (OMS) as storyboards: ordered steps',
  'with a responsibility hand-off between lanes (actors, channels, systems, external parties).',
  'Answer with the requested format only. Do not invent identifiers.',
].join(' ');

/**
 * Optional AI assists (source-spec §10). Every assist returns a proposal the user may apply to the
 * editor draft; nothing here can write a file, and the prompt carries only what the assist needs.
 */
export class StoryboardAiService {
  constructor(private readonly opts: StoryboardAiOptions) {}

  async assist(kind: AiAssistKind, id: string, stepId: string): Promise<StoryboardResult<{ proposal: AiProposal }>> {
    if (!['draftProse', 'reviewExtensions', 'suggestLinks'].includes(kind)) return { ok: false, code: 'invalid', message: `Unknown assist "${String(kind)}".` };
    const r = this.opts.storyboards.detail(id);
    if (!r.ok) return r;
    const step = r.detail.steps.find((s) => s.id === stepId && s.readable);
    if (!step) return { ok: false, code: 'not-found', message: `No readable step "${stepId}".` };

    const index = this.opts.linkIndex.get();
    const { instruction, maxTokens } = INSTRUCTIONS[kind];
    const user = bounded([context(r.detail, step), kind === 'suggestLinks' || kind === 'reviewExtensions' ? candidates(kind, index) : '', this.extracts(r.detail, step), instruction]);
    let reply: string;
    try {
      reply = await this.opts.adapter.complete({ system: SYSTEM, user, maxTokens });
    } catch (err) {
      return { ok: false, code: 'invalid', message: `The AI assist failed: ${(err as Error).message}` };
    }
    try {
      return { ok: true, proposal: parse(kind, reply, r.detail, step, index) };
    } catch (err) {
      return { ok: false, code: 'invalid', message: `The AI reply could not be used: ${(err as Error).message}` };
    }
  }

  private extracts(d: StoryboardDetail, step: Step): string {
    const refs = [...step.links.requirements, ...(d.evidence?.kbLinks ?? []).filter((l) => l.exists).map((l) => l.path)].slice(0, MAX_EXTRACTS);
    const parts = refs.flatMap((ref) => {
      const text = this.opts.extract(ref);
      return text ? [`### ${ref}\n${text.slice(0, MAX_EXTRACT_CHARS)}`] : [];
    });
    return parts.length ? `## Linked documents (extracts)\n${parts.join('\n\n')}` : '';
  }
}

const INSTRUCTIONS: Record<AiAssistKind, { instruction: string; maxTokens: number }> = {
  draftProse: {
    instruction: '## Task\nWrite the step prose in Markdown with exactly three sections: "## What happens" (standalone, read aloud in workshops), "## Business rules" (bullets), "## Notes" (caveats, open questions). No alternate paths; they are modelled separately.',
    maxTokens: 1500,
  },
  reviewExtensions: {
    instruction: '## Task\nList alternate paths (exceptions) this step is missing, given the journey and the known state transitions. Reply with a JSON array of {"when": string, "then": string, "continueAt": {"kind":"stay"} | {"kind":"end"} | {"kind":"step","step":"<later step id>"}}.',
    maxTokens: 1500,
  },
  suggestLinks: {
    instruction: '## Task\nSuggest links for this step, choosing only from the candidate lists. Reply with a JSON object {"api":[],"events":[],"states":[],"requirements":[]}.',
    maxTokens: 800,
  },
};

function context(d: StoryboardDetail, step: Step): string {
  const lane = (id?: string) => (id ? `${d.lanes.find((l) => l.id === id)?.label ?? id}` : 'n/a');
  const lines = [
    `# Storyboard: ${d.title}`,
    `Lanes: ${d.lanes.map((l) => `${l.label} (${l.kind})`).join(', ')}`,
    `Journey: ${d.steps.map((s) => `${s.index + 1}. ${s.title} [${s.id}]`).join('; ')}`,
    `## Current step ${step.index + 1}: ${step.title} [${step.id}]`,
    `Kind: ${step.kind}; hand-off: ${lane(step.from)} → ${lane(step.to)}`,
    `Declared links: ${LINK_CATEGORIES.map((c) => `${c}: ${step.links[c].join(', ') || '-'}`).join('; ')}`,
    step.extensions.length ? `Existing alternate paths: ${step.extensions.map((e) => `when ${e.when}`).join('; ')}` : '',
    step.body.trim() ? `Current prose:\n${step.body.trim().slice(0, 2_000)}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

function candidates(kind: AiAssistKind, index: LinkIndex): string {
  const text = kind === 'reviewExtensions'
    ? `## Known state transitions\n${index.states.join('\n')}`
    : `## Candidate links\n${LINK_CATEGORIES.map((c) => `${c}: ${index[c].join(', ')}`).join('\n')}`;
  return text.slice(0, MAX_INDEX_CHARS);
}

/** Joins prompt parts and cuts from the middle parts first, so the task instruction always survives. */
function bounded(parts: string[]): string {
  const present = parts.filter(Boolean);
  let text = present.join('\n\n');
  if (text.length <= MAX_CONTEXT_CHARS) return text;
  const instruction = present[present.length - 1];
  const budget = MAX_CONTEXT_CHARS - instruction.length - 2;
  text = present.slice(0, -1).join('\n\n').slice(0, budget);
  return `${text}\n\n${instruction}`;
}

function jsonIn(reply: string, open: '[' | '{'): unknown {
  const close = open === '[' ? ']' : '}';
  const start = reply.indexOf(open);
  const end = reply.lastIndexOf(close);
  if (start < 0 || end < start) throw new Error('no JSON in the reply');
  return JSON.parse(reply.slice(start, end + 1));
}

function parse(kind: AiAssistKind, reply: string, d: StoryboardDetail, step: Step, index: LinkIndex): AiProposal {
  if (kind === 'draftProse') {
    const markdown = reply.trim().replace(/^```(?:markdown|md)?\s*\n/, '').replace(/\n```\s*$/, '').trim();
    return { kind, markdown: `${markdown}\n` };
  }
  if (kind === 'suggestLinks') {
    const raw = jsonIn(reply, '{') as Record<string, unknown>;
    const pick = (c: (typeof LINK_CATEGORIES)[number]) => {
      const allowed = new Set(index[c]);
      // Only exact members of the index survive: the model must not invent identifiers.
      return [...new Set((Array.isArray(raw[c]) ? raw[c] : []).filter((v): v is string => typeof v === 'string' && allowed.has(v)))];
    };
    return { kind, links: { api: pick('api'), events: pick('events'), states: pick('states'), requirements: pick('requirements') } };
  }
  const raw = jsonIn(reply, '[');
  const later = new Set(d.steps.filter((s) => s.index > step.index).map((s) => s.id));
  const extensions = (Array.isArray(raw) ? raw : []).flatMap((e) => {
    if (!e || typeof e !== 'object') return [];
    const o = e as Record<string, unknown>;
    if (typeof o.when !== 'string' || !o.when.trim() || typeof o.then !== 'string' || !o.then.trim()) return [];
    const c = (o.continueAt ?? {}) as Record<string, unknown>;
    let continueAt: ContinueAt;
    if (c.kind === 'stay' || c.kind === 'end') continueAt = { kind: c.kind };
    else if (c.kind === 'step' && typeof c.step === 'string' && later.has(c.step)) continueAt = { kind: 'step', step: c.step };
    else return [];
    return [{ when: o.when.trim(), then: o.then.trim(), continueAt }];
  });
  return { kind: 'reviewExtensions', extensions };
}
