import { isDeepStrictEqual } from 'util';
import { Document as YamlDocument, isMap, isScalar, type Document, type Node } from 'yaml';
import { ASSET_NAME, SLUG, isDomain } from '../../shared/storyboards/ids';
import {
  LANE_KINDS,
  LINK_CATEGORIES,
  STEP_KINDS,
  STEP_PATCH_KEYS,
  STORY_PATCH_KEYS,
  STORY_STATUSES,
  type StepPatch,
  type StoryPatch,
} from '../../shared/types/storyboards';
import { parseFrontMatter } from './parse';

// ----- patch validation: the renderer is untrusted, so a patch is checked key by key -----

export class PatchError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, what: string, max = 2000): string => {
  if (typeof v !== 'string' || !v.trim() || v.length > max) throw new PatchError(`${what} must be non-empty text`);
  return v;
};
const optText = (v: unknown, what: string, max = 2000): string | undefined => (v === undefined ? undefined : text(v, what, max));
const slug = (v: unknown, what: string): string => {
  if (typeof v !== 'string' || !SLUG.test(v)) throw new PatchError(`${what} must be a slug`);
  return v;
};
const list = (v: unknown, what: string): unknown[] => {
  if (!Array.isArray(v) || v.length > 200) throw new PatchError(`${what} must be a list`);
  return v;
};
const onlyKeys = (o: Record<string, unknown>, keys: string[], what: string) => {
  const extra = Object.keys(o).filter((k) => !keys.includes(k));
  if (extra.length) throw new PatchError(`${what} has unknown keys: ${extra.join(', ')}`);
};
/** Drops undefined values so that the YAML output carries no empty keys. */
const clean = <T extends Record<string, unknown>>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

function origin(v: unknown): Record<string, unknown> {
  if (!isObj(v)) throw new PatchError('origin must be an object');
  switch (v.kind) {
    case 'step':
    case 'extension':
      onlyKeys(v, ['kind', 'ref'], 'origin');
      if (typeof v.ref !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}(\/[a-z0-9][a-z0-9-]{0,63})?$/.test(v.ref)) throw new PatchError('origin.ref must be a step or step/extension id');
      return { kind: v.kind, ref: v.ref };
    case 'external':
      onlyKeys(v, ['kind', 'lane', 'label'], 'origin');
      if (v.lane !== undefined) return { kind: 'external', lane: slug(v.lane, 'origin.lane') };
      return { kind: 'external', label: text(v.label, 'origin.label', 200) };
    case 'unknown':
      return { kind: 'unknown' };
    default:
      throw new PatchError('origin.kind must be step, extension, external or unknown');
  }
}

const inputs = (v: unknown) =>
  list(v, 'in').map((raw) => {
    if (!isObj(raw)) throw new PatchError('in entries must be objects');
    onlyKeys(raw, ['name', 'shape', 'origin'], 'in entry');
    return clean({ name: text(raw.name, 'in.name', 200), shape: optText(raw.shape, 'in.shape', 500), origin: origin(raw.origin ?? { kind: 'unknown' }) });
  });

const outputs = (v: unknown) =>
  list(v, 'out').map((raw) => {
    if (!isObj(raw)) throw new PatchError('out entries must be objects');
    onlyKeys(raw, ['name', 'shape', 'final'], 'out entry');
    if (raw.final !== undefined && typeof raw.final !== 'boolean') throw new PatchError('out.final must be true or false');
    return clean({ name: text(raw.name, 'out.name', 200), shape: optText(raw.shape, 'out.shape', 500), final: raw.final === true ? true : undefined });
  });

const illustrations = (v: unknown) =>
  list(v, 'illustrations').map((raw) => {
    if (!isObj(raw)) throw new PatchError('illustrations entries must be objects');
    onlyKeys(raw, ['src', 'caption'], 'illustration');
    if (typeof raw.src !== 'string' || !ASSET_NAME.test(raw.src)) throw new PatchError('illustration src must be a flat asset file name');
    return clean({ src: raw.src, caption: optText(raw.caption, 'caption', 500) });
  });

function continueAt(v: unknown): Record<string, unknown> {
  if (!isObj(v)) throw new PatchError('continueAt must be an object');
  if (v.kind === 'stay' || v.kind === 'end') return { kind: v.kind };
  if (v.kind === 'step') return { kind: 'step', step: slug(v.step, 'continueAt.step') };
  throw new PatchError('continueAt.kind must be stay, step or end');
}

export function validateStepPatch(patch: unknown): StepPatch {
  if (!isObj(patch)) throw new PatchError('patch must be an object');
  onlyKeys(patch, [...STEP_PATCH_KEYS], 'step patch');
  const out: Record<string, unknown> = {};
  if (patch.title !== undefined) out.title = text(patch.title, 'title', 200);
  if (patch.kind !== undefined) {
    if (!STEP_KINDS.includes(patch.kind as never)) throw new PatchError(`kind must be one of ${STEP_KINDS.join(', ')}`);
    out.kind = patch.kind;
  }
  for (const end of ['from', 'to'] as const) {
    if (patch[end] === null) out[end] = null;
    else if (patch[end] !== undefined) out[end] = slug(patch[end], end);
  }
  if (patch.illustrations !== undefined) out.illustrations = illustrations(patch.illustrations);
  if (patch.links !== undefined) {
    if (!isObj(patch.links)) throw new PatchError('links must be an object');
    onlyKeys(patch.links, [...LINK_CATEGORIES], 'links');
    const links: Record<string, string[]> = {};
    for (const category of LINK_CATEGORIES) {
      const values = patch.links[category];
      if (values !== undefined) links[category] = list(values, `links.${category}`).map((t) => text(t, `links.${category} entry`, 200));
    }
    out.links = links;
  }
  if (patch.in !== undefined) out.in = inputs(patch.in);
  if (patch.out !== undefined) out.out = outputs(patch.out);
  if (patch.extensions !== undefined) {
    out.extensions = list(patch.extensions, 'extensions').map((raw) => {
      if (!isObj(raw)) throw new PatchError('extensions entries must be objects');
      onlyKeys(raw, ['id', 'when', 'then', 'continueAt', 'illustrations', 'in', 'out'], 'extension');
      return clean({
        id: slug(raw.id, 'extension id'),
        when: text(raw.when, 'when'),
        then: text(raw.then, 'then'),
        continueAt: continueAt(raw.continueAt),
        illustrations: raw.illustrations === undefined || (Array.isArray(raw.illustrations) && !raw.illustrations.length) ? undefined : illustrations(raw.illustrations),
        in: raw.in === undefined || (Array.isArray(raw.in) && !raw.in.length) ? undefined : inputs(raw.in),
        out: raw.out === undefined || (Array.isArray(raw.out) && !raw.out.length) ? undefined : outputs(raw.out),
      });
    });
  }
  return out as StepPatch;
}

export function validateStoryPatch(patch: unknown): StoryPatch {
  if (!isObj(patch)) throw new PatchError('patch must be an object');
  onlyKeys(patch, [...STORY_PATCH_KEYS], 'story patch');
  const out: Record<string, unknown> = {};
  if (patch.title !== undefined) out.title = text(patch.title, 'title', 200);
  if (patch.status !== undefined) {
    if (!STORY_STATUSES.includes(patch.status as never)) throw new PatchError(`status must be one of ${STORY_STATUSES.join(', ')}`);
    out.status = patch.status;
  }
  if (patch.domain !== undefined) {
    if (typeof patch.domain !== 'string' || !isDomain(patch.domain)) throw new PatchError('domain must be one or more /-separated slugs');
    out.domain = patch.domain;
  }
  if (patch.owner !== undefined) out.owner = text(patch.owner, 'owner', 200);
  if (patch.tags !== undefined) out.tags = list(patch.tags, 'tags').map((t) => text(t, 'tag', 100));
  if (patch.lanes !== undefined) {
    const seen = new Set<string>();
    out.lanes = list(patch.lanes, 'lanes').map((raw) => {
      if (!isObj(raw)) throw new PatchError('lanes entries must be objects');
      onlyKeys(raw, ['id', 'label', 'kind'], 'lane');
      const id = slug(raw.id, 'lane id');
      if (seen.has(id)) throw new PatchError(`lane id ${id} is used twice`);
      seen.add(id);
      if (!LANE_KINDS.includes(raw.kind as never)) throw new PatchError(`lane kind must be one of ${LANE_KINDS.join(', ')}`);
      return { id, label: text(raw.label, 'lane label', 200), kind: raw.kind };
    });
  }
  return out as StoryPatch;
}

// ----- applying a patch to the front-matter text -----

/**
 * Rewrites only the source text of the top-level keys whose value really changes (null removes the
 * key, a new key is appended). Every other byte, including comments, quoting and flow style, stays
 * as the author wrote it, so a review diff shows exactly the edited keys. Returns null when nothing
 * changes.
 */
export function patchFrontMatter(raw: string, doc: Document, current: Record<string, unknown>, patch: Record<string, unknown>): string | null {
  if (!isMap(doc.contents) && doc.contents !== null) throw new PatchError('the front matter is not a mapping');
  if (isMap(doc.contents) && doc.contents.flow) throw new PatchError('front matter written as one flow mapping ({ … }) cannot be edited key by key');
  const pairs = isMap(doc.contents) ? doc.contents.items : [];
  const lineStart = (i: number) => raw.lastIndexOf('\n', i - 1) + 1;
  const lineEnd = (i: number) => {
    const nl = raw.indexOf('\n', i);
    return nl < 0 ? raw.length : nl + 1;
  };
  const eol = /\r\n/.test(raw) ? '\r\n' : '\n';
  const render = (key: string, value: unknown) => new YamlDocument({ [key]: value }).toString({ lineWidth: 0 }).replace(/\r?\n/g, eol);
  const keyStarts = pairs.flatMap((p) => (isScalar(p.key) && p.key.range ? [p.key.range[0]] : []));

  const replacements: { start: number; end: number; text: string }[] = [];
  const appends: string[] = [];
  for (const [key, raw_] of Object.entries(patch)) {
    if (raw_ === undefined) continue;
    // An empty list (or a map of empty lists) means the same as an absent key: it is never written.
    const value = isEmpty(raw_) ? null : raw_;
    const pair = pairs.find((p) => isScalar(p.key) && p.key.value === key);
    if (value === null && !pair) continue;
    if (value !== null && pair && isDeepStrictEqual(normaliseEmpty(current[key]), normaliseEmpty(value))) continue;
    if (!pair) {
      appends.push(render(key, value));
      continue;
    }
    const keyRange = (pair.key as Node).range!;
    const valueEnd = (pair.value as Node | null)?.range?.[1] ?? keyRange[1];
    const span = { start: lineStart(keyRange[0]), end: lineEnd(Math.max(valueEnd - 1, keyRange[1])) };
    // A key that shares its lines with another key cannot be cut out without damaging that one.
    if (keyStarts.some((s) => s !== keyRange[0] && s >= span.start && s < span.end)) {
      throw new PatchError(`"${key}" shares a line with another key; put each key on its own line to edit it here`);
    }
    if (value === null) {
      replacements.push({ ...span, text: '' });
      continue;
    }
    let text = render(key, value);
    // Keep a trailing comment of a single-line key (`title: Old # why`) when the new value is one line too.
    const comment = (pair.value as Node | null)?.comment;
    if (comment && !comment.includes('\n') && text.split(eol).filter(Boolean).length === 1) text = text.replace(/\r?\n$/, ` #${comment}${eol}`);
    replacements.push({ ...span, text });
  }
  if (!replacements.length && !appends.length) return null;
  let out = raw;
  for (const e of replacements.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  if (appends.length) {
    const separator = out && !out.endsWith('\n') ? eol : '';
    out = out + separator + appends.join('').replace(/\r?\n$/, '');
  }
  return out;
}

function isEmpty(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0;
  if (value && typeof value === 'object') return Object.values(value).every((v) => Array.isArray(v) && v.length === 0);
  return false;
}

/** Drops empty lists from maps, so `{ requirements: [x], api: [] }` equals `{ requirements: [x] }`. */
function normaliseEmpty(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => !(Array.isArray(v) && v.length === 0)));
  }
  return value;
}

/** `---` + front matter + `---` + body, with the file's own line endings. */
export function serialize(frontMatter: string, body: string, eol: '\n' | '\r\n'): string {
  const fm = frontMatter.replace(/\r\n/g, '\n').replace(/\n*$/, '\n');
  const text = `---\n${fm}---\n${body.replace(/\r\n/g, '\n')}`;
  return eol === '\r\n' ? text.replace(/\n/g, '\r\n') : text;
}

/** Throws when generated content would not read back as front matter (written files must parse). */
export function assertParses(text: string): Record<string, unknown> {
  return parseFrontMatter(text).data;
}
