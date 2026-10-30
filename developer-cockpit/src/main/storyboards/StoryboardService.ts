import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import { ASSET_NAME, EDITABLE_ASSET_NAME, SLUG, assetStem, isDomain, slugify } from '../../shared/storyboards/ids';
import { checkSvg } from './svgSafety';
import type { CockpitEvent, StoryboardsChangedPayload } from '../../shared/types/events';
import { extensionLabel } from '../../shared/storyboards/labels';
import { validate } from '../../shared/storyboards/validate';
import type {
  DriftStatus,
  Evidence,
  Illustration,
  LinkIndex,
  ScanError,
  ScanResult,
  Step,
  StoryboardDetail,
  StoryboardResult,
  StoryboardSummary,
  StoryboardsConfig,
  TrustTier,
} from '../../shared/types/storyboards';
import { expandRoots, toPosix, type ResolvedRoot } from './roots';
import { PatchError, assertParses, patchFrontMatter, serialize, validateStepPatch, validateStoryPatch } from './frontMatter';
import {
  READ_FAILURE_TEXT,
  sha256,
  type FrontMatterFile,
  asString,
  extensionsOf,
  headingsOf,
  illustrationsOf,
  inputsOf,
  lanesOf,
  linksOf,
  outputsOf,
  parseFrontMatter,
  readBounded,
  revisionOf,
  stepKind,
  storyStatus,
  stringList,
  summaryOf,
  type RawIllustration,
} from './parse';

export const ASSET_SCHEME = 'storyboard-asset';
const SKIP_DIRS = new Set(['_templates', '_library', 'node_modules']);

export interface CardInfo {
  hasCard: boolean;
  trust: TrustTier;
  drift: DriftStatus;
  brokenEvidence: boolean;
  evidence: Evidence | null;
  overrides: { id?: string; title?: string; description?: string; status?: unknown; tags?: string[] };
}

/** Evaluates a parsed story.card.yaml (trust, drift, kb links); replaced by EvidenceService. */
export type CardEvaluator = (card: Record<string, unknown>, storyDir: string) => Omit<CardInfo, 'hasCard' | 'overrides'>;

export interface StoryboardServiceOptions {
  workspaceRoot: string;
  kbPath: string;
  config: StoryboardsConfig;
  evaluateCard?: CardEvaluator;
  /** Valid link targets; categories left empty are not checked. */
  linkIndex?: { get(): LinkIndex };
  /** Sends `storyboards:changed` to the renderer (the cockpit WebSocket). */
  broadcast?: (event: CockpitEvent) => void;
  /** Quiet period before a burst of external changes becomes one rescan and one event. */
  debounceMs?: number;
  log?: Pick<Console, 'info' | 'warn'>;
}

const EMPTY_INDEX: LinkIndex = { api: [], events: [], states: [], requirements: [] };

/** One entry of the last successful scan: the only way an id becomes a folder. */
export interface ScanEntry {
  id: string;
  dir: string;
  root: ResolvedRoot;
  summary: StoryboardSummary;
  card: CardInfo;
  /** Requirement ids linked from any step, for backlinks. */
  requirementLinks: string[];
}

const defaultEvaluator: CardEvaluator = (card) => {
  const verified = Array.isArray(card.verified) ? card.verified : [];
  const human = verified.some((v) => typeof (v as { by?: unknown })?.by === 'string' && (v as { by: string }).by.startsWith('human:'));
  return { trust: human ? 'human-verified' : 'evidenced', drift: 'none', brokenEvidence: false, evidence: null };
};

type WriteResult = StoryboardResult<{ revision: string; changed: boolean }>;

/** A plain scalar when YAML reads it back unchanged, otherwise a double-quoted string. */
function yamlScalar(value: string): string {
  try {
    if (parseYaml(`v: ${value}`)?.v === value && !/^\s|\s$/.test(value)) return value;
  } catch {
    // fall through to quoting
  }
  return JSON.stringify(value);
}

/**
 * Whether `<parent>/<sub>` is a real folder inside `parent`: 'linked' for a symlink, a junction, or
 * anything whose real path is not exactly where it should be. Storyboards never read or write
 * through such a folder.
 */
export function folderState(parent: string, sub: string): 'absent' | 'ok' | 'linked' {
  const p = path.join(parent, sub);
  let st: fs.Stats;
  try {
    st = fs.lstatSync(p);
  } catch {
    return 'absent';
  }
  if (st.isSymbolicLink() || !st.isDirectory()) return 'linked';
  try {
    return fs.realpathSync(p) === path.join(fs.realpathSync(parent), sub) ? 'ok' : 'linked';
  } catch {
    return 'linked';
  }
}

class ContainmentError extends Error {}

/** Throws unless `file` sits directly in the storyboard folder or its own steps/ or assets/, and is not a link. */
function assertContained(storyDir: string, file: string): void {
  const realStory = fs.realpathSync(storyDir);
  const parent = fs.realpathSync(path.dirname(file));
  if (![realStory, path.join(realStory, 'steps'), path.join(realStory, 'assets')].includes(parent)) {
    throw new ContainmentError(`${path.basename(file)} is outside the storyboard folder`);
  }
  try {
    if (fs.lstatSync(file).isSymbolicLink()) throw new ContainmentError(`${path.basename(file)} is a symbolic link`);
  } catch (err) {
    if (err instanceof ContainmentError) throw err;
  }
}

/** recentWrites marker for a file this service removed. */
const DELETED = 'deleted';

const notFound = (message: string) => ({ ok: false as const, code: 'not-found' as const, message });
const invalid = (message: string) => ({ ok: false as const, code: 'invalid' as const, message });

export class StoryboardService {
  private entries = new Map<string, ScanEntry>();
  private roots: ResolvedRoot[] = [];
  private readonly workspace: string;
  /** Hashes of files this service just wrote (or DELETED), so the watcher echo of our own change is not broadcast. */
  private readonly recentWrites = new Map<string, { hash: string; at: number }>();
  private changeTimer: NodeJS.Timeout | null = null;

  constructor(private readonly opts: StoryboardServiceOptions) {
    this.workspace = fs.realpathSync(opts.workspaceRoot);
  }

  get config(): StoryboardsConfig {
    return this.opts.config;
  }

  /** Absolute root folders of the last scan, for the file watcher. */
  rootDirs(): string[] {
    return this.roots.map((r) => r.dir);
  }

  /** Applies a new configuration: clears the catalogue, rescans and tells the renderer. */
  reconfigure(config: StoryboardsConfig): ScanResult {
    this.opts.config = config;
    this.entries = new Map();
    this.roots = [];
    const result = this.scan();
    this.opts.broadcast?.({ type: 'storyboards:changed', timestamp: Date.now(), payload: { reason: 'config' } satisfies StoryboardsChangedPayload });
    return result;
  }

  /**
   * A raw watcher event. Our own writes and deletes (same content hash, within a few seconds) are
   * dropped; anything else under a root becomes one debounced rescan and one `storyboards:changed`,
   * because a change can add or remove whole storyboards.
   */
  onWatcherPath(filePath: string, kind: string): void {
    if (!this.opts.config.enabled) return;
    const abs = path.resolve(filePath);
    if (!this.roots.some((r) => abs === r.dir || abs.startsWith(r.dir + path.sep))) return;
    if (path.basename(abs).startsWith('.')) return; // our temporary files and editor swap files
    const own = this.ownWrite(abs);
    if (own !== undefined) {
      if (kind === 'unlink' && own === DELETED) return;
      if (kind !== 'unlink') {
        try {
          if (sha256(fs.readFileSync(abs)) === own) return;
        } catch {
          // gone again: treat as external
        }
      }
    }
    if (this.changeTimer) clearTimeout(this.changeTimer);
    this.changeTimer = setTimeout(() => {
      this.changeTimer = null;
      this.scan();
      this.opts.broadcast?.({ type: 'storyboards:changed', timestamp: Date.now(), payload: { reason: 'external' } satisfies StoryboardsChangedPayload });
    }, this.opts.debounceMs ?? 300);
  }

  dispose(): void {
    if (this.changeTimer) clearTimeout(this.changeTimer);
    this.changeTimer = null;
  }

  /** Walks every root for folders containing story.md; swaps in the new id map only when done. */
  scan(): ScanResult {
    const started = Date.now();
    const { config } = this.opts;
    if (!config.enabled) {
      this.entries = new Map();
      this.roots = [];
      return { enabled: false, writable: config.writable, catalogue: [], errors: [], roots: [] };
    }

    const errors: ScanError[] = [];
    const { roots, missing } = expandRoots(this.workspace, config.roots);
    for (const pattern of missing) {
      errors.push({ code: 'missing-root', path: pattern, message: `Storyboard root "${pattern}" does not exist.` });
    }

    const found: ScanEntry[] = [];
    for (const root of roots) this.walk(root, root.dir, found, errors);

    const byId = new Map<string, ScanEntry[]>();
    for (const entry of found) byId.set(entry.id, [...(byId.get(entry.id) ?? []), entry]);
    const entries = new Map<string, ScanEntry>();
    for (const [id, list] of byId) {
      if (list.length === 1) {
        entries.set(id, list[0]);
        continue;
      }
      // Neither copy wins: which one a walk meets first must never decide what readers see.
      for (const dup of list) {
        errors.push({
          code: 'duplicate-id',
          path: `${dup.summary.sourcePath}/story.md`,
          message: `Storyboard id "${id}" is used by ${list.length} folders: ${list.map((d) => d.summary.sourcePath).join(', ')}.`,
        });
      }
    }

    this.entries = entries;
    this.roots = roots;
    const catalogue = [...entries.values()]
      .map((e) => e.summary)
      .sort((a, b) => a.domain.localeCompare(b.domain) || a.title.localeCompare(b.title));
    this.opts.log?.info?.(`[storyboards] scanned ${catalogue.length} storyboard(s), ${errors.length} error(s) in ${Date.now() - started} ms`);
    return {
      enabled: true,
      writable: config.writable,
      catalogue,
      errors,
      roots: roots.map((r) => ({ rootId: r.rootId, label: r.label })),
    };
  }

  /** The scan entry for an id, or undefined when the id is invalid or unknown to the last scan. */
  entry(id: string): ScanEntry | undefined {
    return typeof id === 'string' && SLUG.test(id) ? this.entries.get(id) : undefined;
  }

  /**
   * The full storyboard for the reader, resolved only through the last scan. Advisory problems are
   * part of the result; a broken storyboard still opens so its author can see and fix it.
   */
  detail(id: string): StoryboardResult<{ detail: StoryboardDetail }> {
    const entry = this.entry(id);
    if (!entry) return { ok: false, code: 'not-found', message: `No storyboard "${id}" in the last scan.` };
    const read = readBounded(path.join(entry.dir, 'story.md'), this.opts.config.maxSourceBytes);
    if (!read.ok) return { ok: false, code: 'not-found', message: `story.md of "${id}" can no longer be read: ${READ_FAILURE_TEXT[read.reason]}.` };
    let data: Record<string, unknown>;
    let body: string;
    try {
      ({ data, body } = parseFrontMatter(read.text));
    } catch (err) {
      return { ok: false, code: 'invalid', message: `story.md of "${id}" is malformed: ${(err as Error).message}` };
    }

    const stepIds = stringList(data.steps);
    const steps = stepIds.map((stepId, index) => this.loadStep(entry.id, entry.dir, stepId, index).step);
    const listed = new Set(stepIds);
    let orphanSteps: string[] = [];
    if (folderState(entry.dir, 'steps') === 'ok') {
      try {
        orphanSteps = fs
          .readdirSync(path.join(entry.dir, 'steps'), { withFileTypes: true })
          .filter((d) => d.isFile() && d.name.endsWith('.md') && !listed.has(d.name.slice(0, -3)))
          .map((d) => d.name.slice(0, -3))
          .sort();
      } catch {
        orphanSteps = [];
      }
    }

    const lanes = lanesOf(data.lanes);
    const detail: StoryboardDetail = {
      ...entry.summary,
      lanes,
      steps,
      body,
      headings: headingsOf(body),
      revision: revisionOf(read.bytes, read.mtimeMs),
      evidence: entry.card.evidence,
      orphanSteps,
      problems: [],
    };
    detail.problems = validate(detail, this.opts.linkIndex?.get() ?? EMPTY_INDEX);
    return { ok: true, detail };
  }

  // ----- writes -----

  /** Saves the patched story front-matter keys and the body of story.md. */
  saveStory(id: string, patch: unknown, body: unknown, revision: unknown): WriteResult {
    const guard = this.writeGuard(id);
    if (!guard.ok) return guard;
    let checked: Record<string, unknown>;
    try {
      checked = validateStoryPatch(patch);
    } catch (err) {
      return invalid((err as Error).message);
    }
    if (typeof body !== 'string') return invalid('body must be text');
    return this.rewrite(guard.entry.dir, path.join(guard.entry.dir, 'story.md'), revision, (fm) => ({ frontMatter: patchFrontMatter(fm.raw, fm.doc, fm.data, checked), body }));
  }

  /** Saves the patched step front-matter keys and the body of steps/<stepId>.md. */
  saveStep(id: string, stepId: unknown, patch: unknown, body: unknown, revision: unknown): WriteResult {
    const guard = this.writeGuard(id);
    if (!guard.ok) return guard;
    if (typeof stepId !== 'string' || !SLUG.test(stepId)) return notFound(`No step "${String(stepId)}".`);
    let checked: Record<string, unknown>;
    try {
      checked = validateStepPatch(patch);
    } catch (err) {
      return invalid((err as Error).message);
    }
    if (typeof body !== 'string') return invalid('body must be text');
    return this.rewrite(guard.entry.dir, path.join(guard.entry.dir, 'steps', `${stepId}.md`), revision, (fm) => ({ frontMatter: patchFrontMatter(fm.raw, fm.doc, fm.data, checked), body }));
  }

  /**
   * Scaffolds `<root>/<domain>/<slug>/` with story.md, one step file per title and an empty assets/
   * folder. The root is a capability from the last scan, never a path the client composed.
   */
  create(input: unknown): StoryboardResult<{ id: string }> {
    if (!this.opts.config.writable) return { ok: false, code: 'read-only', message: 'Storyboards are configured read-only.' };
    const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    const root = typeof i.rootId === 'string' ? this.root(i.rootId) : undefined;
    if (!root) return invalid('rootId is not a root returned by the last scan');
    if (typeof i.domain !== 'string' || !isDomain(i.domain)) return invalid('domain must be one or more /-separated slugs');
    if (typeof i.title !== 'string' || !i.title.trim() || i.title.length > 200) return invalid('title must be non-empty text');
    const id = slugify(i.title);
    if (!id) return invalid('the title needs at least one letter or digit');
    if (!Array.isArray(i.stepTitles) || !i.stepTitles.length || i.stepTitles.length > 100 || !i.stepTitles.every((t) => typeof t === 'string' && slugify(t))) {
      return invalid('at least one step title with a letter or digit is required');
    }
    let lanes: unknown;
    try {
      lanes = validateStoryPatch({ lanes: i.lanes }).lanes;
    } catch (err) {
      return invalid((err as Error).message);
    }
    // Every existing domain folder on the way must be a real folder inside the root; mkdir would follow a link.
    let parent = root.dir;
    for (const segment of i.domain.split('/')) {
      if (folderState(parent, segment) === 'linked') return invalid(`The domain folder "${segment}" is a linked folder; storyboards are only created inside the root.`);
      parent = path.join(parent, segment);
    }
    const dir = path.join(root.dir, ...i.domain.split('/'), id);
    if (this.entries.has(id) || fs.existsSync(dir)) return { ok: false, code: 'exists', message: `A storyboard "${id}" already exists.` };

    const title = i.title.trim();
    const stepIds: string[] = [];
    const steps: [string, string][] = [];
    try {
      for (const stepTitle of i.stepTitles as string[]) {
        const base = slugify(stepTitle);
        let stepId = base;
        for (let n = 2; stepIds.includes(stepId); n++) stepId = assetStem(base, undefined, n);
        stepIds.push(stepId);
        steps.push([stepId, this.stepTemplate(root.dir, stepId, stepTitle.trim())]);
      }
      const story = this.storyTemplate(root.dir, id, title, i.domain, lanes, stepIds);
      fs.mkdirSync(path.join(dir, 'steps'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
      for (const [stepId, content] of steps) this.writeAtomic(dir, path.join(dir, 'steps', `${stepId}.md`), content);
      this.writeAtomic(dir, path.join(dir, 'story.md'), story);
    } catch (err) {
      fs.rmSync(dir, { recursive: true, force: true });
      return invalid(`The storyboard could not be created: ${(err as Error).message}`);
    }
    this.opts.log?.info?.(`[storyboards] created ${this.rel(dir)}`);
    this.scan();
    return { ok: true, id };
  }

  /** Writes assets/<name>.excalidraw.svg after the SVG safety check; the step references it on its next save. */
  saveIllustration(id: string, name: unknown, svg: unknown): StoryboardResult<{ name: string; url: string }> {
    const guard = this.writeGuard(id);
    if (!guard.ok) return guard;
    if (typeof name !== 'string' || !EDITABLE_ASSET_NAME.test(name)) return invalid('the name must be a flat <slug>.excalidraw.svg file name');
    if (typeof svg !== 'string') return invalid('svg must be text');
    if (Buffer.byteLength(svg, 'utf8') > this.opts.config.maxAssetBytes) {
      return { ok: false, code: 'too-large', message: `The illustration is larger than ${this.opts.config.maxAssetBytes} bytes.` };
    }
    const check = checkSvg(svg, this.opts.config.maxAssetBytes);
    if (!check.ok) {
      this.opts.log?.warn?.(`[storyboards] rejected illustration ${name} for ${id}: ${check.reason}`);
      return invalid(`The SVG was rejected: ${check.reason}.`);
    }
    const assets = path.join(guard.entry.dir, 'assets');
    fs.mkdirSync(assets, { recursive: true });
    const file = path.join(assets, name);
    try {
      this.writeAtomic(guard.entry.dir, file, svg);
    } catch (err) {
      return invalid(`The illustration was not written: ${(err as Error).message}`);
    }
    return { ok: true, name, url: `${ASSET_SCHEME}://${id}/${name}` };
  }

  /** The shared Excalidraw library of the storyboard's root, if the root has one. */
  library(id: string): StoryboardResult<{ library: string | null }> {
    const entry = this.entry(id);
    if (!entry) return notFound(`No storyboard "${id}" in the last scan.`);
    if (folderState(entry.root.dir, '_library') !== 'ok') return { ok: true, library: null };
    const read = readBounded(path.join(entry.root.dir, '_library', 'oms-storyboard.excalidrawlib'), this.opts.config.maxSourceBytes * 4);
    return { ok: true, library: read.ok ? read.text : null };
  }

  /** Rewrites only the `steps` list of story.md; step files keep their names and contents. */
  reorder(id: string, stepIds: unknown, revision: unknown): StoryboardResult<{ revision: string }> {
    const guard = this.writeGuard(id);
    if (!guard.ok) return guard;
    return this.rewriteSteps(guard.entry, revision, (current) => {
      if (!Array.isArray(stepIds) || stepIds.length !== current.length || new Set(stepIds).size !== stepIds.length || !stepIds.every((s) => current.includes(s))) {
        throw new PatchError('stepIds must be a reordering of the current steps');
      }
      return stepIds as string[];
    });
  }

  /** Creates steps/<slug>.md from the root template (or the built-in one) and lists it after `afterStepId`. */
  createStep(id: string, title: unknown, afterStepId: unknown, revision: unknown): StoryboardResult<{ stepId: string; revision: string }> {
    const guard = this.writeGuard(id);
    if (!guard.ok) return guard;
    const { entry } = guard;
    if (typeof title !== 'string' || !title.trim() || title.length > 200) return invalid('title must be non-empty text');
    const base = slugify(title);
    if (!base) return invalid('the title needs at least one letter or digit');

    const storyFile = path.join(entry.dir, 'story.md');
    const read = readBounded(storyFile, this.opts.config.maxSourceBytes);
    if (!read.ok) return notFound(READ_FAILURE_TEXT[read.reason]);
    const current = revisionOf(read.bytes, read.mtimeMs);
    if (revision !== current) return { ok: false, code: 'conflict', message: 'story.md changed since it was opened.', latestRevision: current };
    const listed = stringList(parseFrontMatter(read.text).data.steps);
    if (afterStepId !== null && afterStepId !== undefined && !listed.includes(afterStepId as string)) return invalid(`"${String(afterStepId)}" is not a step of this storyboard`);

    const stepsDir = path.join(entry.dir, 'steps');
    let stepId = base;
    for (let n = 2; listed.includes(stepId) || fs.existsSync(path.join(stepsDir, `${stepId}.md`)); n++) stepId = assetStem(base, undefined, n);
    let content: string;
    try {
      content = this.stepTemplate(entry.root.dir, stepId, title.trim());
    } catch (err) {
      return invalid((err as Error).message);
    }
    fs.mkdirSync(stepsDir, { recursive: true });
    const stepFile = path.join(stepsDir, `${stepId}.md`);
    try {
      this.writeAtomic(entry.dir, stepFile, content);
    } catch (err) {
      return invalid(`The step was not created: ${(err as Error).message}`);
    }

    const at = afterStepId ? listed.indexOf(afterStepId as string) + 1 : listed.length;
    const result = this.rewriteSteps(entry, revision, (ids) => [...ids.slice(0, at), stepId, ...ids.slice(at)]);
    if (!result.ok) {
      fs.rmSync(stepFile, { force: true });
      return result;
    }
    return { ok: true, stepId, revision: result.revision };
  }

  /**
   * Removes a step from the order. Only with `deleteAssets` are its file and the assets that it alone
   * references deleted; otherwise everything stays on disk and shows up as an orphan (recoverable).
   */
  deleteStep(id: string, stepId: unknown, deleteAssets: unknown, revision: unknown): StoryboardResult<{ revision: string; deleted: string[] }> {
    const guard = this.writeGuard(id);
    if (!guard.ok) return guard;
    const { entry } = guard;
    let removed = false;
    const result = this.rewriteSteps(entry, revision, (ids) => {
      if (typeof stepId !== 'string' || !SLUG.test(stepId) || !ids.includes(stepId)) throw new PatchError(`"${String(stepId)}" is not a step of this storyboard`);
      removed = true;
      return ids.filter((s) => s !== stepId);
    });
    if (!result.ok || !removed || deleteAssets !== true) return result.ok ? { ...result, deleted: [] } : result;

    const sid = stepId as string;
    const refs = (file: string): string[] => {
      const r = readBounded(file, this.opts.config.maxSourceBytes);
      if (!r.ok) return [];
      try {
        const data = parseFrontMatter(r.text).data;
        return [...illustrationsOf(data.illustrations), ...extensionsOf(data.extensions).flatMap((e) => e.illustrations)].map((i) => i.src);
      } catch {
        return [];
      }
    };
    const stepsDir = path.join(entry.dir, 'steps');
    const own = new Set(refs(path.join(stepsDir, `${sid}.md`)));
    const others = new Set(
      fs.readdirSync(stepsDir).filter((f) => f.endsWith('.md') && f !== `${sid}.md`).flatMap((f) => refs(path.join(stepsDir, f))),
    );
    const deleted: string[] = [];
    for (const src of own) {
      if (others.has(src) || !ASSET_NAME.test(src)) continue;
      const file = path.join(entry.dir, 'assets', src);
      try {
        if (!fs.lstatSync(file).isFile()) continue;
        assertContained(entry.dir, file);
        fs.rmSync(file);
      } catch {
        continue;
      }
      this.recentWrites.set(path.resolve(file), { hash: DELETED, at: Date.now() });
      deleted.push(`assets/${src}`);
    }
    const stepFile = path.join(stepsDir, `${sid}.md`);
    let removable = false;
    try {
      removable = fs.lstatSync(stepFile).isFile();
      assertContained(entry.dir, stepFile);
    } catch {
      removable = false;
    }
    if (removable) {
      fs.rmSync(stepFile);
      this.recentWrites.set(path.resolve(stepFile), { hash: DELETED, at: Date.now() });
      deleted.push(`steps/${sid}.md`);
    }
    this.opts.log?.info?.(`[storyboards] deleted ${deleted.join(', ') || 'nothing'} from ${entry.id}`);
    this.scan();
    return { ok: true, revision: result.revision, deleted };
  }

  private rewriteSteps(entry: ScanEntry, revision: unknown, next: (current: string[]) => string[]): StoryboardResult<{ revision: string }> {
    const result = this.rewrite(entry.dir, path.join(entry.dir, 'story.md'), revision, (fm) => {
      const ids = next(stringList(fm.data.steps));
      return { frontMatter: patchFrontMatter(fm.raw, fm.doc, fm.data, { steps: ids }), body: fm.body };
    });
    if (!result.ok) return result;
    if (result.changed) this.scan();
    return { ok: true, revision: result.revision };
  }

  /** `_templates/story.md` of the root with id, title, domain, lanes and steps filled in, else a built-in story. */
  private storyTemplate(rootDir: string, id: string, title: string, domain: string, lanes: unknown, stepIds: string[]): string {
    const template = folderState(rootDir, '_templates') === 'ok' ? readBounded(path.join(rootDir, '_templates', 'story.md'), this.opts.config.maxSourceBytes) : null;
    const base = template?.ok
      ? template.text.replace(/\{\{id\}\}/g, id).replace(/\{\{title\}\}/g, JSON.stringify(title)).replace(/\{\{domain\}\}/g, domain)
      : `---\nid: ${id}\ntitle: ${yamlScalar(title)}\ndomain: ${domain}\nstatus: draft\n---\n\n## Summary\n\n## Scope and assumptions\n`;
    const fm = parseFrontMatter(base);
    const patched = patchFrontMatter(fm.raw, fm.doc, fm.data, { id, title, domain, lanes, steps: stepIds });
    const content = serialize(patched ?? fm.raw, fm.body, fm.eol);
    if (assertParses(content).id !== id) throw new Error('the story template must contain "id: {{id}}"');
    return content;
  }

  /** `_templates/step.md` of the storyboard's root, else the built-in skeleton with the house sections. */
  private stepTemplate(rootDir: string, stepId: string, title: string): string {
    const template = folderState(rootDir, '_templates') === 'ok' ? readBounded(path.join(rootDir, '_templates', 'step.md'), this.opts.config.maxSourceBytes) : null;
    const content = template?.ok
      ? template.text.replace(/\{\{id\}\}/g, stepId).replace(/\{\{title\}\}/g, JSON.stringify(title))
      : `---\nid: ${stepId}\ntitle: ${yamlScalar(title)}\nkind: system\n---\n\n## What happens\n\n## Business rules\n\n## Notes\n`;
    const data = assertParses(content);
    if (data.id !== stepId) throw new Error('the step template must contain "id: {{id}}"');
    return content;
  }

  /** The file hash this service last wrote to `file` within the last few seconds, if any. */
  ownWrite(file: string): string | undefined {
    const key = path.resolve(file);
    const hit = this.recentWrites.get(key);
    if (!hit) return undefined;
    if (Date.now() - hit.at > 5000) {
      this.recentWrites.delete(key);
      return undefined;
    }
    return hit.hash;
  }

  private writeGuard(id: string): { ok: true; entry: ScanEntry } | StoryboardResult<never> {
    if (!this.opts.config.writable) return { ok: false, code: 'read-only', message: 'Storyboards are configured read-only.' };
    const entry = this.entry(id);
    if (!entry) return notFound(`No storyboard "${id}" in the last scan.`);
    for (const sub of ['steps', 'assets']) {
      if (folderState(entry.dir, sub) === 'linked') return invalid(`${sub}/ of "${id}" is a linked folder; storyboards only write inside their own folder.`);
    }
    return { ok: true, entry };
  }

  /**
   * Read → check revision → change → serialise → re-parse → write atomically. An unchanged result
   * writes nothing (same bytes, same mtime); a failed change leaves the original untouched.
   */
  private rewrite(storyDir: string, file: string, revision: unknown, change: (fm: FrontMatterFile) => { frontMatter: string | null; body: string }): WriteResult {
    const read = readBounded(file, this.opts.config.maxSourceBytes);
    if (!read.ok) return read.reason === 'oversized' ? { ok: false, code: 'too-large', message: READ_FAILURE_TEXT.oversized } : notFound(`${this.rel(file)}: ${READ_FAILURE_TEXT[read.reason]}.`);
    const current = revisionOf(read.bytes, read.mtimeMs);
    if (revision !== current) {
      this.opts.log?.warn?.(`[storyboards] conflict on ${this.rel(file)}`);
      return { ok: false, code: 'conflict', message: `${this.rel(file)} changed since it was opened.`, latestRevision: current };
    }
    let fm: FrontMatterFile;
    let result: { frontMatter: string | null; body: string };
    try {
      fm = parseFrontMatter(read.text);
      result = change(fm);
    } catch (err) {
      return invalid(err instanceof PatchError ? err.message : `${this.rel(file)} cannot be updated: ${(err as Error).message}`);
    }
    const normalise = (s: string) => s.replace(/\r\n/g, '\n');
    if (result.frontMatter === null && normalise(result.body) === normalise(fm.body)) return { ok: true, revision: current, changed: false };

    const next = serialize(result.frontMatter ?? fm.raw, result.body, fm.eol);
    if (Buffer.byteLength(next, 'utf8') > this.opts.config.maxSourceBytes) return { ok: false, code: 'too-large', message: 'The result is larger than the configured limit.' };
    try {
      assertParses(next);
    } catch (err) {
      return invalid(`The updated file would not parse: ${(err as Error).message}`);
    }
    try {
      return { ok: true, revision: this.writeAtomic(storyDir, file, next), changed: true };
    } catch (err) {
      return invalid(`${this.rel(file)} was not written: ${(err as Error).message}`);
    }
  }

  /** Writes through a temporary file in the same folder and a rename; returns the new revision. */
  writeAtomic(storyDir: string, file: string, content: string | Buffer): string {
    assertContained(storyDir, file);
    const bytes = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
    const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now().toString(36)}.tmp`);
    fs.writeFileSync(tmp, bytes);
    try {
      fs.renameSync(tmp, file);
    } catch (err) {
      fs.rmSync(tmp, { force: true });
      throw err;
    }
    this.recentWrites.set(path.resolve(file), { hash: sha256(bytes), at: Date.now() });
    this.opts.log?.info?.(`[storyboards] wrote ${this.rel(file)}`);
    return revisionOf(bytes, fs.statSync(file).mtimeMs);
  }

  /**
   * Storyboards that reference a knowledge-base document (through their card's `kb_links`) or a
   * requirement id (through any step's `links.requirements`), from the last scan.
   */
  backlinks(target: string): { id: string; title: string }[] {
    if (typeof target !== 'string' || !target.trim()) return [];
    const doc = target.trim().replace(/\\/g, '/').replace(/^\/+/, '');
    return this.allEntries()
      .filter((e) =>
        e.requirementLinks.includes(target.trim()) ||
        (e.card.evidence?.kbLinks ?? []).some((l) => l.exists && l.path.replace(/^\/+/, '') === doc),
      )
      .map((e) => ({ id: e.id, title: e.summary.title }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  root(rootId: string): ResolvedRoot | undefined {
    return this.roots.find((r) => r.rootId === rootId);
  }

  allEntries(): ScanEntry[] {
    return [...this.entries.values()];
  }

  rel(abs: string): string {
    return toPosix(path.relative(this.workspace, abs));
  }

  private walk(root: ResolvedRoot, dir: string, found: ScanEntry[], errors: ScanError[]): void {
    let dirents: fs.Dirent[];
    try {
      dirents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (dirents.some((d) => d.name === 'story.md')) {
      const entry = this.readStory(root, dir, errors);
      if (entry) found.push(entry);
      return; // a storyboard folder holds steps/ and assets/, never nested storyboards
    }
    for (const d of dirents.sort((a, b) => a.name.localeCompare(b.name))) {
      if (d.name.startsWith('.') || SKIP_DIRS.has(d.name)) continue;
      const child = path.join(dir, d.name);
      let st: fs.Stats;
      try {
        st = fs.lstatSync(child);
      } catch {
        continue;
      }
      if (st.isSymbolicLink()) {
        errors.push({ code: 'symlink', path: this.rel(child), message: `${this.rel(child)} is a symbolic link and is ignored.` });
        continue;
      }
      if (st.isDirectory()) this.walk(root, child, found, errors);
    }
  }

  private readStory(root: ResolvedRoot, dir: string, errors: ScanError[]): ScanEntry | null {
    const storyFile = path.join(dir, 'story.md');
    const rel = this.rel(storyFile);
    const read = readBounded(storyFile, this.opts.config.maxSourceBytes);
    if (!read.ok) {
      const code = read.reason === 'symlink' ? 'symlink' : read.reason === 'oversized' ? 'oversized' : 'malformed-story';
      errors.push({ code, path: rel, message: `${rel}: ${READ_FAILURE_TEXT[read.reason]}.` });
      return null;
    }
    let data: Record<string, unknown>;
    let body: string;
    try {
      ({ data, body } = parseFrontMatter(read.text));
    } catch (err) {
      errors.push({ code: 'malformed-story', path: rel, message: `${rel}: ${(err as Error).message}` });
      return null;
    }
    const storyId = asString(data.id);
    if (!storyId || !SLUG.test(storyId)) {
      errors.push({ code: 'malformed-story', path: rel, message: `${rel}: "id" must be a slug matching ${SLUG}.` });
      return null;
    }

    for (const sub of ['steps', 'assets']) {
      if (folderState(dir, sub) === 'linked') {
        const relSub = this.rel(path.join(dir, sub));
        errors.push({ code: 'symlink', path: relSub, message: `${relSub} is a linked folder; storyboards do not read or write through it.` });
      }
    }
    const card = this.readCard(dir, errors);
    const stepIds = stringList(data.steps);
    let modified = read.mtimeMs;
    const stepTitles: string[] = [];
    const thumbnails: (string | null)[] = [];
    const requirementLinks = new Set<string>();
    for (const stepId of stepIds) {
      const step = this.loadStep(storyId, dir, stepId, 0);
      modified = Math.max(modified, step.mtimeMs);
      stepTitles.push(step.step.title);
      step.step.links.requirements.forEach((r) => requirementLinks.add(r));
      const first = step.step.illustrations[0];
      thumbnails.push(first && !first.missing ? first.url : null);
    }

    const relDir = toPosix(path.relative(root.dir, path.dirname(dir)));
    const summary: StoryboardSummary = {
      id: storyId,
      title: card.overrides.title ?? asString(data.title) ?? storyId,
      description: card.overrides.description ?? summaryOf(body),
      domain: asString(data.domain) ?? (relDir && relDir !== '.' ? relDir : 'general'),
      status: storyStatus(card.overrides.status ?? data.status),
      ...(asString(data.owner) && { owner: asString(data.owner) }),
      tags: card.overrides.tags ?? stringList(data.tags),
      sourcePath: this.rel(dir),
      modified,
      stepCount: stepIds.length,
      stepTitles,
      thumbnails,
      trust: card.trust,
      drift: card.drift,
      hasCard: card.hasCard,
      brokenEvidence: card.brokenEvidence,
    };
    return { id: storyId, dir, root, summary, card, requirementLinks: [...requirementLinks] };
  }

  private readCard(dir: string, errors: ScanError[]): CardInfo {
    const file = path.join(dir, 'story.card.yaml');
    const none: CardInfo = { hasCard: false, trust: 'unevidenced', drift: 'none', brokenEvidence: false, evidence: null, overrides: {} };
    let st: fs.Stats;
    try {
      st = fs.lstatSync(file);
    } catch {
      return none;
    }
    const rel = this.rel(file);
    const broken = (message: string): CardInfo => {
      errors.push({ code: 'malformed-card', path: rel, message: `${rel}: ${message}` });
      return { ...none, hasCard: true, brokenEvidence: true };
    };
    if (st.isSymbolicLink()) return broken('the card is a symbolic link');
    const read = readBounded(file, this.opts.config.maxSourceBytes);
    if (!read.ok) return broken(READ_FAILURE_TEXT[read.reason]);
    let card: unknown;
    try {
      card = parseYaml(read.text);
    } catch (err) {
      return broken((err as Error).message);
    }
    if (!card || typeof card !== 'object' || Array.isArray(card) || !asString((card as Record<string, unknown>).id)) {
      return broken('the card must be a mapping with an "id"');
    }
    const c = card as Record<string, unknown>;
    const evaluated = (this.opts.evaluateCard ?? defaultEvaluator)(c, dir);
    return {
      hasCard: true,
      ...evaluated,
      overrides: {
        id: asString(c.id),
        title: asString(c.title),
        description: asString(c.description),
        status: c.status,
        tags: Array.isArray(c.tags) ? stringList(c.tags) : undefined,
      },
    };
  }

  /** Reads one step file into the resolved model; a file that cannot be read becomes a stub. */
  loadStep(storyId: string, dir: string, stepId: string, index: number): { step: Step; mtimeMs: number } {
    const file = path.join(dir, 'steps', `${stepId}.md`);
    const stub = (reason: string): { step: Step; mtimeMs: number } => ({
      step: {
        id: stepId, index, title: stepId, kind: 'system', illustrations: [], links: { api: [], events: [], states: [], requirements: [] },
        in: [], out: [], extensions: [], body: '', headings: [], revision: '', sourcePath: this.rel(file), readable: false, unreadableReason: reason,
      },
      mtimeMs: 0,
    });
    if (!SLUG.test(stepId)) return stub('the step id is not a valid slug');
    if (folderState(dir, 'steps') === 'linked') return stub('steps/ is a linked folder');
    const read = readBounded(file, this.opts.config.maxSourceBytes);
    if (!read.ok) return stub(READ_FAILURE_TEXT[read.reason]);
    let data: Record<string, unknown>;
    let body: string;
    try {
      ({ data, body } = parseFrontMatter(read.text));
    } catch (err) {
      return stub(`malformed front matter (${(err as Error).message})`);
    }
    if (asString(data.id) !== stepId) return stub(`its "id" (${asString(data.id) ?? 'none'}) does not match the file name`);

    const resolve = (ills: RawIllustration[]) => ills.map((i) => this.illustration(storyId, dir, i));
    const step: Step = {
      id: stepId,
      index,
      title: asString(data.title) ?? stepId,
      kind: stepKind(data.kind),
      ...(asString(data.from) && { from: asString(data.from) }),
      ...(asString(data.to) && { to: asString(data.to) }),
      illustrations: resolve(illustrationsOf(data.illustrations)),
      links: linksOf(data.links),
      in: inputsOf(data.in),
      out: outputsOf(data.out),
      extensions: extensionsOf(data.extensions).map((e, i) => ({ ...e, label: extensionLabel(index, i), illustrations: resolve(e.illustrations) })),
      body,
      headings: headingsOf(body),
      revision: revisionOf(read.bytes, read.mtimeMs),
      sourcePath: this.rel(file),
      readable: true,
    };
    return { step, mtimeMs: read.mtimeMs };
  }

  /** Resolves a stored flat file name to its protocol URL; anything that is not a flat asset name gets no URL. */
  illustration(storyId: string, dir: string, ill: RawIllustration): Illustration {
    const valid = ASSET_NAME.test(ill.src) && folderState(dir, 'assets') !== 'linked';
    let missing = true;
    if (valid) {
      try {
        const st = fs.lstatSync(path.join(dir, 'assets', ill.src));
        missing = !st.isFile() || st.isSymbolicLink();
      } catch {
        missing = true;
      }
    }
    return {
      src: ill.src,
      ...(ill.caption && { caption: ill.caption }),
      url: valid ? `${ASSET_SCHEME}://${storyId}/${ill.src}` : null,
      missing,
      editable: EDITABLE_ASSET_NAME.test(ill.src),
    };
  }
}
