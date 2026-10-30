import * as crypto from 'crypto';
import * as fs from 'fs';
import { Document, parseDocument } from 'yaml';
import {
  STEP_KINDS,
  STORY_STATUSES,
  LANE_KINDS,
  type ContinueAt,
  type DataIn,
  type DataOut,
  type Heading,
  type Lane,
  type Origin,
  type StepKind,
  type StepLinks,
  type StoryStatus,
} from '../../shared/types/storyboards';

// ----- bounded, symlink-safe reads -----

export type ReadFailure = 'missing' | 'symlink' | 'oversized' | 'not-file';
export type BoundedRead = { ok: true; bytes: Buffer; text: string; mtimeMs: number } | { ok: false; reason: ReadFailure };

/** Reads a regular file only: never follows a symlink, never reads more than `maxBytes`. */
export function readBounded(file: string, maxBytes: number): BoundedRead {
  let st: fs.Stats;
  try {
    st = fs.lstatSync(file);
  } catch {
    return { ok: false, reason: 'missing' };
  }
  if (st.isSymbolicLink()) return { ok: false, reason: 'symlink' };
  if (!st.isFile()) return { ok: false, reason: 'not-file' };
  if (st.size > maxBytes) return { ok: false, reason: 'oversized' };
  const bytes = fs.readFileSync(file);
  if (bytes.length > maxBytes) return { ok: false, reason: 'oversized' };
  return { ok: true, bytes, text: bytes.toString('utf8'), mtimeMs: st.mtimeMs };
}

export const READ_FAILURE_TEXT: Record<ReadFailure, string> = {
  missing: 'the file is missing',
  symlink: 'the file is a symbolic link',
  oversized: 'the file is larger than the configured limit',
  'not-file': 'the path is not a regular file',
};

/** `<mtime>-<content hash>`: a save is accepted only against the revision it was based on. */
export function revisionOf(bytes: Buffer, mtimeMs: number): string {
  return `${Math.trunc(mtimeMs)}-${crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16)}`;
}

export function sha256(bytes: Buffer | string): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

// ----- front matter -----

export interface FrontMatterFile {
  /** The YAML document, kept so that saves can change single keys without reformatting the rest. */
  doc: Document;
  data: Record<string, unknown>;
  body: string;
  /** The front-matter text exactly as written, reused verbatim when a save changes only the body. */
  raw: string;
  /** Line ending of the file, preserved on save. */
  eol: '\n' | '\r\n';
}

// The closing --- must start a line; an empty block (---\n---) is allowed.
const FRONT_MATTER = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

/** Splits `---\n<yaml>\n---\n<body>`; throws when the block is missing or not valid YAML mapping. */
export function parseFrontMatter(text: string): FrontMatterFile {
  const source = text.replace(/^﻿/, '');
  const match = FRONT_MATTER.exec(source);
  if (!match) throw new Error('no YAML front matter block');
  const doc = parseDocument(match[1] ?? '', { prettyErrors: false });
  if (doc.errors.length) throw new Error(doc.errors[0].message);
  const data = doc.toJS();
  const base = { doc, body: source.slice(match[0].length), raw: match[1] ?? '', eol: eolOf(source) };
  if (data === null || data === undefined) return { ...base, data: {} };
  if (typeof data !== 'object' || Array.isArray(data)) throw new Error('front matter is not a mapping');
  return { ...base, data: data as Record<string, unknown> };
}

function eolOf(text: string): '\n' | '\r\n' {
  return /\r\n/.test(text.slice(0, 200)) ? '\r\n' : '\n';
}

// ----- markdown helpers -----

/** Same anchor rule as the renderer's MarkdownContent, so links into steps line up. */
export function anchorOf(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export function headingsOf(body: string): Heading[] {
  const headings: Heading[] = [];
  let fence = false;
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (fence) continue;
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) headings.push({ level: m[1].length, text: m[2], anchor: anchorOf(m[2]) });
  }
  return headings;
}

/** The first paragraph under `## Summary`, flattened to one line; '' when absent. */
export function summaryOf(body: string): string {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+Summary\s*$/i.test(l));
  if (start < 0) return '';
  const para: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,6}\s/.test(line)) break;
    if (!line.trim()) {
      if (para.length) break;
      continue;
    }
    para.push(line.trim());
  }
  return para.join(' ');
}

export { sectionOf } from '../../shared/storyboards/sections';

// ----- normalisation of front-matter values -----

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export const asString = str;

export function stringList(v: unknown): string[] {
  return arr(v).map(str).filter((s): s is string => s !== undefined);
}

export function storyStatus(v: unknown): StoryStatus {
  return STORY_STATUSES.includes(v as StoryStatus) ? (v as StoryStatus) : 'draft';
}

export function stepKind(v: unknown): StepKind {
  return STEP_KINDS.includes(v as StepKind) ? (v as StepKind) : 'system';
}

export function lanesOf(v: unknown): Lane[] {
  return arr(v).flatMap((raw) => {
    const o = obj(raw);
    const id = str(o.id);
    if (!id) return [];
    const kind = LANE_KINDS.includes(o.kind as Lane['kind']) ? (o.kind as Lane['kind']) : 'system';
    return [{ id, label: str(o.label) ?? id, kind }];
  });
}

export function linksOf(v: unknown): StepLinks {
  const o = obj(v);
  return { api: stringList(o.api), events: stringList(o.events), states: stringList(o.states), requirements: stringList(o.requirements) };
}

export function originOf(v: unknown): Origin {
  const o = obj(v);
  const kind = o.kind;
  if (kind === 'step' && str(o.ref)) return { kind: 'step', ref: str(o.ref)! };
  if (kind === 'extension' && str(o.ref)) return { kind: 'extension', ref: str(o.ref)! };
  if (kind === 'external' && str(o.lane)) return { kind: 'external', lane: str(o.lane)! };
  if (kind === 'external' && str(o.label)) return { kind: 'external', label: str(o.label)! };
  return { kind: 'unknown' };
}

export function inputsOf(v: unknown): DataIn[] {
  return arr(v).flatMap((raw) => {
    const o = obj(raw);
    const name = str(o.name);
    if (!name) return [];
    return [{ name, ...(str(o.shape) && { shape: str(o.shape) }), origin: originOf(o.origin) }];
  });
}

export function outputsOf(v: unknown): DataOut[] {
  return arr(v).flatMap((raw) => {
    const o = obj(raw);
    const name = str(o.name);
    if (!name) return [];
    return [{ name, ...(str(o.shape) && { shape: str(o.shape) }), ...(o.final === true && { final: true }) }];
  });
}

export function continueAtOf(v: unknown): ContinueAt {
  const o = obj(v);
  if (o.kind === 'step' && str(o.step)) return { kind: 'step', step: str(o.step)! };
  if (o.kind === 'stay') return { kind: 'stay' };
  return { kind: 'end' };
}

export interface RawIllustration {
  src: string;
  caption?: string;
}

export function illustrationsOf(v: unknown): RawIllustration[] {
  return arr(v).flatMap((raw) => {
    const o = obj(raw);
    const src = str(o.src);
    return src ? [{ src, ...(str(o.caption) && { caption: str(o.caption) }) }] : [];
  });
}

export interface RawExtension {
  id: string;
  when: string;
  then: string;
  continueAt: ContinueAt;
  illustrations: RawIllustration[];
  in: DataIn[];
  out: DataOut[];
}

export function extensionsOf(v: unknown): RawExtension[] {
  return arr(v).flatMap((raw) => {
    const o = obj(raw);
    const id = str(o.id);
    if (!id) return [];
    return [{
      id,
      when: str(o.when) ?? '',
      then: str(o.then) ?? '',
      continueAt: continueAtOf(o.continueAt),
      illustrations: illustrationsOf(o.illustrations),
      in: inputsOf(o.in),
      out: outputsOf(o.out),
    }];
  });
}
