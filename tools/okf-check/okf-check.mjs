#!/usr/bin/env node
/**
 * OKF v0.2 conformance checker for the OMS knowledge base.
 *
 *   node tools/okf-check/okf-check.mjs <bundleDir> [--repo <repositoryRoot>] [--json]
 *   node tools/okf-check/okf-check.mjs <bundleDir> --fix-indexes [--dry-run] [--json]
 *
 * Checks OKF §11 conformance plus the project rules from SPEC-0009 and SPEC-0010 (see README.md
 * for the rule table). `repo:` sources resolve against --repo (default: the bundle's parent). Prints `ERROR <file> [<rule>]: <message>` per finding and `WARN …` per freshness warning; exit 0 clean, 1 errors (warnings never fail), 2 usage.
 * --json prints { concepts, errors, warnings, stats } instead. --fix-indexes adds the links folder
 * indexes miss (SPEC-0064); --dry-run only lists them.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import yaml from 'js-yaml';

const RESERVED = new Set(['index.md', 'log.md']);
const SKIP_DIRS = new Set(['node_modules']);
/** Folders at the bundle root that are not part of the bundle: storyboards have their own format and checker (SPEC-0014). */
export const SKIP_ROOT_DIRS = new Set(['storyboards']);
const STATUSES = new Set(['draft', 'stable', 'deprecated']);
const CONVENTIONS = 'okf-conventions.md';
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const ACTOR = /^(human:\S+|process:\S+|[\w.-]+\/[\w.-]+)$/;
const LOG_DATE = /^\d{4}-\d{2}-\d{2}$/;
const REPO_SCHEME = 'repo:';
const MATURITIES = new Set(['implemented', 'partial', 'planned']);
const PRIORITIES = new Set(['must', 'should', 'could', 'wont']);
const IMPLEMENTATIONS = new Set(['implemented', 'partial', 'not-implemented']);
const PROVENANCE_TYPES = new Set(['Capability', 'Requirement', 'Domain Concept', 'Glossary', 'Interface', 'Architecture', 'Component', 'Decision']);
const ACTOR_KINDS = new Set(['human', 'system', 'external']);

/** Folder layout of the capability catalogue (SPEC-0061), relative to the bundle root. */
export const FR_DIR = 'capabilities/functional-requirements';
export const NFR_DIR = 'capabilities/non-functional-requirements';
export const USE_CASE_DIR = 'capabilities/use-cases';
export const ACTOR_DIR = 'capabilities/actors';
export const ARCHIVE_DIR = 'archive';

// ----- parsing -----

/** Split a file into { fm, body, error }; fm is null when there is no front matter block. */
export function parseFrontMatter(text) {
  const content = text.replace(/^\uFEFF/, '');
  const lines = content.split(/\r?\n/);
  if (lines[0] !== '---') return { fm: null, body: content };
  const end = lines.indexOf('---', 1);
  if (end < 0) return { fm: null, body: content, error: 'front matter block is not closed with ---' };
  const body = lines.slice(end + 1).join('\n');
  try {
    const fm = yaml.load(lines.slice(1, end).join('\n'), { schema: yaml.JSON_SCHEMA });
    if (fm === null || typeof fm !== 'object' || Array.isArray(fm)) {
      return { fm: null, body, error: 'front matter is not a YAML mapping' };
    }
    return { fm, body };
  } catch (e) {
    return { fm: null, body, error: `unparseable YAML: ${e.reason || e.message}` };
  }
}

/** Markdown link targets outside fenced code blocks and inline code spans. */
export function linkTargets(body) {
  const targets = [];
  let fence = null;
  for (const line of body.split(/\r?\n/)) {
    const f = line.trim().match(/^(`{3,}|~{3,})/);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      continue;
    }
    if (fence) continue;
    const text = line.replace(/`[^`]*`/g, '');
    for (const m of text.matchAll(/\[(?:\\.|[^\]\\])*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) targets.push(m[1]);
  }
  return targets;
}

/** Resolve a link to an absolute path, or null when it is external or a pure anchor. */
function resolveLink(bundle, fromFile, target) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) return null;
  let path = target.replace(/[#?].*$/, '');
  try { path = decodeURIComponent(path); } catch { /* keep raw */ }
  if (!path) return null;
  return path.startsWith('/') ? join(bundle, path) : resolve(dirname(fromFile), path);
}

/** A link target is a file, or a folder that has an index.md. */
function linkTargetExists(abs) {
  if (!existsSync(abs)) return false;
  return statSync(abs).isFile() || existsSync(join(abs, 'index.md'));
}

// ----- bundle walk -----

function walk(dir, out = { files: [], dirs: [dir] }, depth = 0) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !(depth === 0 && SKIP_ROOT_DIRS.has(e.name))) { out.dirs.push(p); walk(p, out, depth + 1); } }
    else if (e.name.endsWith('.md')) out.files.push(p);
  }
  return out;
}

// ----- checks -----

/**
 * @param bundleDir the bundle root
 * @param options.repo repository root that `repo:` sources resolve against (default: the bundle's parent)
 * @param options.now the current time in ms, for the freshness warnings (default: Date.now())
 * @returns { concepts, errors, warnings, stats } (SPEC-0064: warnings and stats)
 */
export function checkBundle(bundleDir, { repo, now = Date.now() } = {}) {
  const bundle = resolve(bundleDir);
  const repoRoot = resolve(repo ?? dirname(bundle));
  const rel = (p) => relative(bundle, p).split(sep).join('/');
  const errors = [];
  const warnings = [];
  const err = (p, rule, message) => errors.push({ file: rel(p), rule, message });
  const warn = (p, rule, message) => warnings.push({ file: rel(p), rule, message });

  const { files, dirs } = walk(bundle);
  const parsed = new Map(files.map((p) => [p, parseFrontMatter(readFileSync(p, 'utf8'))]));
  const isReserved = (p) => RESERVED.has(p.split(sep).pop());
  const concepts = files.filter((p) => !isReserved(p));

  // type vocabulary from <bundle>/okf-conventions.md
  const convPath = join(bundle, CONVENTIONS);
  const vocab = parsed.get(convPath)?.fm?.type_vocabulary;
  const vocabulary = Array.isArray(vocab) && vocab.length ? new Set(vocab) : null;
  if (!vocabulary) err(convPath, 'OMS-VOCAB', `missing ${CONVENTIONS} with a non-empty type_vocabulary list`);

  for (const p of concepts) {
    const { fm, error } = parsed.get(p);
    if (!fm) { err(p, 'OKF-FM', error || 'no YAML front matter (file must start with ---)'); continue; }
    checkConcept(fm, (rule, message) => err(p, rule, message), vocabulary);
  }

  const settings = parsed.get(convPath)?.fm || {};
  checkStructure(bundle, repoRoot, concepts, parsed, err);
  checkReview(bundle, concepts, parsed, err, settings);
  checkIndexes(bundle, dirs, concepts, parsed, err);
  for (const p of files.filter((f) => f.endsWith(`${sep}log.md`))) checkLog(p, parsed.get(p), err);

  for (const p of files) {
    for (const target of linkTargets(parsed.get(p).body)) {
      const abs = resolveLink(bundle, p, target);
      if (!abs) continue;
      if (abs !== bundle && !abs.startsWith(bundle + sep)) err(p, 'OKF-LINK', `link leaves the bundle: ${target}`);
      else if (!linkTargetExists(abs)) err(p, 'OKF-LINK', `broken link: ${target}`);
    }
  }

  const drift = checkFreshness(bundle, repoRoot, concepts, parsed, warn, settings, now);
  const stats = statistics(bundle, concepts, parsed, settings, now, drift);
  return { concepts: concepts.length, errors, warnings, stats };
}

function checkConcept(fm, err, vocabulary) {
  const nonEmpty = (v) => typeof v === 'string' && v.trim() !== '';
  if (!nonEmpty(fm.type)) err('OKF-TYPE', 'type must be a non-empty string');
  else if (vocabulary && !vocabulary.has(fm.type)) err('OMS-VOCAB', `type "${fm.type}" is not in the type_vocabulary of ${CONVENTIONS}`);
  for (const key of ['title', 'description']) if (!nonEmpty(fm[key])) err('OMS-KEYS', `${key} must be a non-empty string`);
  if (!Array.isArray(fm.tags) || !fm.tags.length || !fm.tags.every(nonEmpty)) err('OMS-KEYS', 'tags must be a non-empty list of strings');
  if (!STATUSES.has(fm.status)) err('OKF-STATUS', `status must be one of ${[...STATUSES].join(', ')} (found ${JSON.stringify(fm.status)})`);

  const instant = (key, v) => {
    if (v === undefined) return;
    if (typeof v !== 'string' || !ISO_INSTANT.test(v) || Number.isNaN(Date.parse(v))) {
      err('OKF-TIME', `${key} must be an ISO 8601 instant with a UTC offset (found ${JSON.stringify(v)})`);
    }
  };
  const actor = (key, v) => {
    if (typeof v !== 'string' || !ACTOR.test(v)) err('OKF-ACTOR', `${key} must be human:<id>, process:<id> or <producer>/<version> (found ${JSON.stringify(v)})`);
  };

  instant('updated', fm.updated);
  instant('stale_after', fm.stale_after);
  if (fm.generated !== undefined) {
    actor('generated.by', fm.generated?.by);
    instant('generated.at', fm.generated?.at);
  }
  if (fm.verified !== undefined) {
    err('OMS-UNVERIFIED', 'verified must not be set by the conversion; a reviewer adds it');
    const events = Array.isArray(fm.verified) ? fm.verified : [fm.verified];
    events.forEach((v, i) => { actor(`verified[${i}].by`, v?.by); instant(`verified[${i}].at`, v?.at); });
  }
  if (Array.isArray(fm.sources)) fm.sources.forEach((s, i) => instant(`sources[${i}].last_modified`, s?.last_modified));
}

/** Rules for the structured concept types (SPEC-0010): capabilities, requirements, sources, provenance. */
function checkStructure(bundle, repoRoot, concepts, parsed, err) {
  const fmOf = (p) => parsed.get(p)?.fm;
  const typeOf = (p) => fmOf(p)?.type;
  const requirementIds = new Map();
  const useCaseIds = new Map();
  const decisionIds = new Map();

  for (const p of concepts) {
    const fm = fmOf(p);
    if (!fm) continue;
    const e = (rule, message) => err(p, rule, message);

    // OMS-SRC: repo: sources exist; implemented requirements cite main code and tests
    const repoPaths = (Array.isArray(fm.sources) ? fm.sources : [])
      .map((s) => s?.resource).filter((r) => typeof r === 'string' && r.startsWith(REPO_SCHEME))
      .map((r) => r.slice(REPO_SCHEME.length));
    for (const rp of repoPaths) {
      const abs = resolve(repoRoot, rp);
      if (!abs.startsWith(repoRoot + sep) || !existsSync(abs)) e('OMS-SRC', `source does not exist in the repository: ${REPO_SCHEME}${rp}`);
    }

    // OMS-PROV: concepts of the structured types are generated with provenance
    if (PROVENANCE_TYPES.has(fm.type)) {
      const by = fm.generated?.by;
      if (typeof by !== 'string' || by.startsWith('human:') || !ACTOR.test(by)) e('OMS-PROV', 'generated.by must be a tool actor <producer>/<version>');
      if (fm.generated?.at === undefined) e('OMS-PROV', 'generated.at must be set');
      if (!Array.isArray(fm.sources) || !fm.sources.length) e('OMS-PROV', 'sources must be a non-empty list');
    }

    const linkedTypes = () => linkTargets(parsed.get(p).body)
      .map((t) => resolveLink(bundle, p, t)).filter(Boolean).map((abs) => typeOf(abs));
    const folderOf = relative(bundle, dirname(p)).split(sep).join('/');
    const fileName = p.split(sep).pop();

    if (fm.type === 'Capability') {
      if (!MATURITIES.has(fm.maturity)) e('OMS-CAP', `maturity must be one of ${[...MATURITIES].join(', ')} (found ${JSON.stringify(fm.maturity)})`);
      if (!Array.isArray(fm.commands) || !fm.commands.every((c) => typeof c === 'string')) e('OMS-CAP', 'commands must be a list of command names (use [] for none)');
      const types = linkedTypes();
      if (!types.includes('Requirement')) e('OMS-CAP', 'must link at least one Requirement concept');
      if (!types.includes('Use Case')) e('OMS-CAP', 'must link at least one Use Case concept');
    }

    if (fm.type === 'Use Case') {
      const id = fm.id;
      if (typeof id !== 'string' || !/^UC-\d{3}$/.test(id)) e('OMS-UC', `id must match UC-nnn (found ${JSON.stringify(id)})`);
      else {
        if (!fileName.startsWith(`${id}-`)) e('OMS-UC', `file name must start with ${id}-`);
        if (useCaseIds.has(id)) e('OMS-UC', `duplicate id ${id}`);
        else useCaseIds.set(id, p);
      }
      if (folderOf !== USE_CASE_DIR) e('OMS-UC', `use cases live in ${USE_CASE_DIR}/`);
      const actors = Array.isArray(fm.actors) ? fm.actors : [];
      if (!actors.length) e('OMS-UC', 'actors must be a non-empty list of Actor paths');
      for (const a of actors) {
        const abs = typeof a === 'string' ? resolveLink(bundle, p, a) : null;
        if (!abs || typeOf(abs) !== 'Actor') e('OMS-UC', `actor ${JSON.stringify(a)} is not an Actor concept`);
      }
      const cap = typeof fm.capability === 'string' ? resolveLink(bundle, p, fm.capability) : null;
      if (!cap || typeOf(cap) !== 'Capability') e('OMS-UC', `capability must point to a Capability concept (found ${JSON.stringify(fm.capability)})`);
      if (!linkedTypes().includes('Requirement')) e('OMS-UC', 'must link at least one Requirement concept');
    }

    if (fm.type === 'Actor') {
      if (!ACTOR_KINDS.has(fm.kind)) e('OMS-ACTOR', `kind must be one of ${[...ACTOR_KINDS].join(', ')} (found ${JSON.stringify(fm.kind)})`);
      if (folderOf !== ACTOR_DIR) e('OMS-ACTOR', `actors live in ${ACTOR_DIR}/`);
    }

    if (fm.type === 'Decision') {
      const id = fm.id;
      if (typeof id !== 'string' || !/^ADR-\d{3}$/.test(id)) e('OMS-ADR', `id must match ADR-nnn (found ${JSON.stringify(id)})`);
      else {
        if (!fileName.startsWith(`${id}-`)) e('OMS-ADR', `file name must start with ${id}-`);
        if (decisionIds.has(id)) e('OMS-ADR', `duplicate id ${id}`);
        else decisionIds.set(id, p);
      }
    }

    if (fm.type === 'Requirement') {
      const id = fm.id;
      const m = typeof id === 'string' ? id.match(/^(FR|NFR)-\d{3}$/) : null;
      if (!m) e('OMS-REQ', `id must match FR-nnn or NFR-nnn (found ${JSON.stringify(id)})`);
      else {
        const folder = m[1] === 'FR' ? FR_DIR : NFR_DIR;
        if (folderOf !== folder) e('OMS-REQ', `${id} must live in ${folder}/`);
        if (requirementIds.has(id)) e('OMS-REQ', `duplicate id ${id} (also ${relative(bundle, requirementIds.get(id)).split(sep).join('/')})`);
        else requirementIds.set(id, p);
      }
      if (!PRIORITIES.has(fm.priority)) e('OMS-REQ', `priority must be one of ${[...PRIORITIES].join(', ')}`);
      if (!IMPLEMENTATIONS.has(fm.implementation)) e('OMS-REQ', `implementation must be one of ${[...IMPLEMENTATIONS].join(', ')}`);
      const cap = typeof fm.capability === 'string' ? resolveLink(bundle, p, fm.capability) : null;
      if (!cap || typeOf(cap) !== 'Capability') e('OMS-REQ', `capability must point to a Capability concept (found ${JSON.stringify(fm.capability)})`);
      if (fm.implementation === 'implemented' || fm.implementation === 'partial') {
        if (!repoPaths.some(isMainSource)) e('OMS-SRC', `${fm.implementation} requirement must cite a main source (repo:…/src/…)`);
        if (!repoPaths.some(isTestSource)) e('OMS-SRC', `${fm.implementation} requirement must cite a test source (repo:…/src/test/… or *.test.*)`);
      }
    }
  }

  // OMS-TRACE: every requirement is exercised by at least one use case
  const traced = new Set(concepts.filter((p) => typeOf(p) === 'Use Case')
    .flatMap((p) => linkTargets(parsed.get(p).body).map((t) => resolveLink(bundle, p, t)).filter(Boolean)));
  for (const p of concepts.filter((c) => typeOf(c) === 'Requirement')) {
    if (!traced.has(p)) err(p, 'OMS-TRACE', 'requirement is not linked from any Use Case');
  }
}

/** Body text that is prose: fenced code blocks and inline code spans removed. */
export function proseText(body) {
  const out = [];
  let fence = null;
  for (const line of body.split(/\r?\n/)) {
    const f = line.trim().match(/^(`{3,}|~{3,})/);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      continue;
    }
    if (!fence) out.push(line.replace(/`[^`]*`/g, ''));
  }
  return out.join('\n');
}

/** Concept id: bundle-relative path without `.md`. */
const conceptId = (bundle, p) => relative(bundle, p).split(sep).join('/').replace(/\.md$/, '');

/** Review, archive and alias rules (SPEC-0061). Settings come from the conventions' front matter. */
function checkReview(bundle, concepts, parsed, err, settings) {
  const archiveRoot = join(bundle, ARCHIVE_DIR) + sep;
  const inArchive = (p) => p.startsWith(archiveRoot);
  const reviewedSince = typeof settings.reviewed_since === 'string' ? Date.parse(settings.reviewed_since) : NaN;
  const retired = (Array.isArray(settings.retired_terms) ? settings.retired_terms : [])
    .filter((t) => typeof t === 'string' && t.trim()).map((t) => t.toLowerCase());
  const ids = new Set(concepts.map((p) => conceptId(bundle, p)));
  const aliasOwners = new Map();

  for (const p of concepts) {
    const { fm, body } = parsed.get(p);
    if (!fm) continue;
    const e = (rule, message) => err(p, rule, message);

    if (!inArchive(p)) {
      if (!Number.isNaN(reviewedSince)) {
        const updated = typeof fm.updated === 'string' ? Date.parse(fm.updated) : NaN;
        if (Number.isNaN(updated) || updated < reviewedSince) e('OMS-REVIEWED', `updated must be on or after ${settings.reviewed_since} (found ${JSON.stringify(fm.updated)})`);
      }
      if (retired.length && fm.point_in_time !== true) {
        const prose = proseText(body).toLowerCase();
        for (const term of retired) if (prose.includes(term)) e('OMS-RETIRED', `retired term "${term}" in prose; correct it, put it in code, or move the document to ${ARCHIVE_DIR}/`);
      }
    } else if (fm.status !== 'deprecated') {
      e('OMS-ARCHIVE', `documents in ${ARCHIVE_DIR}/ must have status: deprecated`);
    }

    if (fm.status === 'deprecated') {
      const s = fm.superseded_by;
      const target = typeof s === 'string' && s !== 'none' ? resolveLink(bundle, p, s) : null;
      if (s !== 'none' && !(target && parsed.get(target)?.fm)) e('OMS-ARCHIVE', `deprecated concept needs superseded_by: a concept path or none (found ${JSON.stringify(s)})`);
    }

    if (fm.aliases !== undefined) {
      if (!Array.isArray(fm.aliases) || !fm.aliases.every((a) => typeof a === 'string' && a.trim())) {
        e('OMS-ALIAS', 'aliases must be a list of former concept ids');
        continue;
      }
      for (const a of fm.aliases) {
        if (ids.has(a)) e('OMS-ALIAS', `alias ${a} names an existing concept`);
        if (aliasOwners.has(a)) e('OMS-ALIAS', `alias ${a} is also claimed by ${conceptId(bundle, aliasOwners.get(a))}`);
        else aliasOwners.set(a, p);
      }
    }
  }
}

// Test sources: a src/test tree (JVM) or *.test.* / *Test.java files (front ends). Main: any other file under a src/ tree.
const isTestSource = (rp) => /(^|\/)src\/test\//.test(rp) || /\.test\.[cm]?[jt]sx?$/.test(rp) || /Test\.java$/.test(rp);
const isMainSource = (rp) => !isTestSource(rp) && /(^|\/)src\//.test(rp);

function checkIndexes(bundle, dirs, concepts, parsed, err) {
  const sepd = (d) => d + sep;
  const hasConcepts = (d) => concepts.some((c) => c.startsWith(sepd(d)));
  const indexDirs = new Set(dirs.filter((d) => d === bundle || hasConcepts(d)));

  for (const d of indexDirs) {
    const indexPath = join(d, 'index.md');
    const isRoot = d === bundle;
    const index = parsed.get(indexPath);
    if (!index) {
      err(indexPath, isRoot ? 'OKF-INDEX-ROOT' : 'OKF-INDEX', 'missing index.md in a folder that contains concepts');
      continue;
    }
    if (isRoot) {
      const keys = index.fm ? Object.keys(index.fm) : [];
      if (index.error || !index.fm || keys.length !== 1 || index.fm.okf_version !== '0.2') {
        err(indexPath, 'OKF-INDEX-ROOT', 'root index.md front matter must be exactly okf_version: "0.2"');
      }
    } else if (index.fm || index.error) {
      err(indexPath, 'OKF-INDEX', 'index.md must not have front matter (only the root declares okf_version)');
    }

    const linked = new Set(linkTargets(index.body)
      .map((t) => resolveLink(bundle, indexPath, t)).filter(Boolean).map((p) => resolve(p)));
    for (const c of concepts.filter((c) => dirname(c) === d)) {
      if (!linked.has(c)) err(indexPath, 'OKF-INDEX', `does not link concept ${relative(d, c).split(sep).join('/')}`);
    }
    for (const sub of [...indexDirs].filter((s) => dirname(s) === d && s !== d)) {
      const subIndex = join(sub, 'index.md');
      if (!linked.has(subIndex)) err(indexPath, 'OKF-INDEX', `does not link sub-folder index ${relative(d, subIndex).split(sep).join('/')}`);
    }
  }
}

function checkLog(p, { fm, error, body }, err) {
  if (fm || error) err(p, 'OKF-LOG', 'log.md must not have front matter');
  let previous = null;
  for (const line of body.split(/\r?\n/)) {
    const h = line.match(/^##\s+(.*?)\s*$/);
    if (!h) continue;
    if (!LOG_DATE.test(h[1])) { err(p, 'OKF-LOG', `log heading must be YYYY-MM-DD (found "${h[1]}")`); continue; }
    if (previous && h[1] >= previous) err(p, 'OKF-LOG', `log dates must be newest first (${h[1]} after ${previous})`);
    previous = h[1];
  }
}

// ----- freshness warnings and statistics (SPEC-0064) -----

const DAY_MS = 24 * 60 * 60 * 1000;

/** `review_after_days` from the conventions: a positive integer, or null (the age rule is off). */
function reviewAfterDays(settings) {
  const days = settings.review_after_days;
  return Number.isInteger(days) && days > 0 ? days : null;
}

const instantOf = (v) => (typeof v === 'string' ? Date.parse(v) : NaN);

/**
 * Warnings that ask for a review; they never fail the check.
 * - OMS-AGE: not updated within review_after_days (archive exempt).
 * - OMS-STALE: stale_after has passed.
 * - OMS-DEPRECATED: deprecated outside archive/.
 * - OMS-DRIFT: a repo: source committed after the document's updated and its own last commit
 *   (archive exempt).
 * @returns 'checked', or 'unavailable' when git could not date the sources
 */
function checkFreshness(bundle, repoRoot, concepts, parsed, warn, settings, now) {
  const archiveRoot = join(bundle, ARCHIVE_DIR) + sep;
  const inArchive = (p) => p.startsWith(archiveRoot);
  const days = reviewAfterDays(settings);
  const day = (ms) => new Date(ms).toISOString().slice(0, 10);
  const minute = (ms) => `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  const sourcesOf = (fm) => (Array.isArray(fm.sources) ? fm.sources : [])
    .map((s) => s?.resource).filter((r) => typeof r === 'string' && r.startsWith(REPO_SCHEME))
    .map((r) => r.slice(REPO_SCHEME.length).replace(/^\/+/, '').replace(/\/+$/, ''))
    .filter(Boolean);

  for (const p of concepts) {
    const { fm } = parsed.get(p);
    if (!fm) continue;
    const updated = instantOf(fm.updated);
    if (days && !inArchive(p) && !Number.isNaN(updated) && now - updated > days * DAY_MS) {
      warn(p, 'OMS-AGE', `not updated for more than ${days} days (updated ${day(updated)}); review it and set updated`);
    }
    const staleAfter = instantOf(fm.stale_after);
    if (!Number.isNaN(staleAfter) && staleAfter < now) {
      warn(p, 'OMS-STALE', `stale since ${day(staleAfter)} (stale_after); review it, then move stale_after or archive it`);
    }
    if (fm.status === 'deprecated' && !inArchive(p)) {
      warn(p, 'OMS-DEPRECATED', `deprecated but outside ${ARCHIVE_DIR}/; move it there`);
    }
  }

  // OMS-DRIFT: date every repo: source with one git call.
  const candidates = concepts
    .filter((p) => !inArchive(p) && parsed.get(p).fm && !Number.isNaN(instantOf(parsed.get(p).fm.updated)))
    .map((p) => ({ p, fm: parsed.get(p).fm, sources: sourcesOf(parsed.get(p).fm) }))
    .filter((c) => c.sources.length);
  // The documents are dated too: a document committed together with (or after) its code was
  // looked at then, even if its `updated` is a few hours older than the commit.
  const repoPath = (p) => relative(repoRoot, p).split(sep).join('/');
  // Paths outside the repository would make git fail for the whole batch; leave them undated.
  const inRepo = (q) => q !== '..' && !q.startsWith('../') && !isAbsolute(q);
  const paths = [...new Set([...candidates.flatMap((c) => c.sources), ...candidates.map((c) => repoPath(c.p))])].filter(inRepo);
  const committed = commitDates(repoRoot, paths);
  if (!committed) return 'unavailable';
  for (const { p, fm, sources } of candidates) {
    const updated = Math.max(instantOf(fm.updated), committed.get(repoPath(p)) ?? -Infinity);
    for (const source of sources) {
      const last = newestCommit(committed, source);
      if (last !== null && last > updated) {
        warn(p, 'OMS-DRIFT', `source ${source} committed ${minute(last)}, after the document was last updated or committed (${minute(updated)}); check it still matches`);
      }
    }
  }
  return 'checked';
}

/** The newest commit time (ms) of every file touched under `paths`, or null without git. */
function commitDates(repoRoot, paths) {
  const probe = spawnSync('git', ['-C', repoRoot, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', windowsHide: true });
  if (probe.status !== 0) return null;
  const dates = new Map();
  if (!paths.length) return dates;
  // Paths relative to the repository root, as git prints them, whatever repoRoot is inside it.
  const prefix = relative(resolve(probe.stdout.trim()), repoRoot).split(sep).join('/');
  // Batches keep each command line well under the Windows limit (32,767 characters).
  for (const batch of batches(paths, 8000)) {
    // core.quotePath=false: non-ASCII paths come out as they are, not quoted and octal-escaped.
    const r = spawnSync('git', ['-C', repoRoot, '-c', 'core.quotePath=false', 'log', '--format=%x00%cI', '--name-only', '--', ...batch],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 60_000, windowsHide: true });
    if (r.status !== 0) return null;
    let current = NaN;
    for (const line of r.stdout.split(/\r?\n/)) {
      if (line.startsWith('\0')) { current = Date.parse(line.slice(1)); continue; }
      if (!line || Number.isNaN(current)) continue;
      const file = prefix && line.startsWith(`${prefix}/`) ? line.slice(prefix.length + 1) : line;
      if (!(dates.get(file) >= current)) dates.set(file, current); // newest across batches
    }
  }
  return dates;
}

/** `items` in batches whose joined length stays under `maxChars`. */
export function batches(items, maxChars) {
  const out = [];
  let batch = [];
  let length = 0;
  for (const item of items) {
    if (batch.length && length + item.length + 1 > maxChars) { out.push(batch); batch = []; length = 0; }
    batch.push(item);
    length += item.length + 1;
  }
  if (batch.length) out.push(batch);
  return out;
}

/** The newest commit of a source file, or of any file under a source folder; null if never committed. */
function newestCommit(dates, source) {
  if (dates.has(source)) return dates.get(source);
  let newest = null;
  for (const [file, time] of dates) if (file.startsWith(`${source}/`) && (newest === null || time > newest)) newest = time;
  return newest;
}

/** Counts over the concepts (navigation files excluded), keys sorted for a stable report. */
function statistics(bundle, concepts, parsed, settings, now, drift) {
  const archiveRoot = join(bundle, ARCHIVE_DIR) + sep;
  const days = reviewAfterDays(settings);
  const count = (map, key) => { map[key] = (map[key] ?? 0) + 1; };
  const sorted = (map) => Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
  const byType = {}; const byStatus = {}; const byFolder = {};
  const byImplementation = {}; const byPriority = {};
  const reviewAge = { reviewAfterDays: days, current: 0, due: 0, unknown: 0 };
  let requirements = 0;

  for (const p of concepts) {
    const fm = parsed.get(p).fm ?? {};
    const parts = relative(bundle, p).split(sep);
    count(byType, typeof fm.type === 'string' && fm.type ? fm.type : '(none)');
    count(byStatus, typeof fm.status === 'string' && fm.status ? fm.status : '(none)');
    count(byFolder, parts.length > 1 ? parts[0] : 'root');
    if (fm.type === 'Requirement') {
      requirements++;
      count(byImplementation, typeof fm.implementation === 'string' ? fm.implementation : '(none)');
      count(byPriority, typeof fm.priority === 'string' ? fm.priority : '(none)');
    }
    if (p.startsWith(archiveRoot)) continue;
    const updated = instantOf(fm.updated);
    if (Number.isNaN(updated)) reviewAge.unknown++;
    else if (days && now - updated > days * DAY_MS) reviewAge.due++;
    else reviewAge.current++;
  }

  return {
    documents: concepts.length,
    byType: sorted(byType),
    byStatus: sorted(byStatus),
    byFolder: sorted(byFolder),
    requirements: { total: requirements, byImplementation: sorted(byImplementation), byPriority: sorted(byPriority) },
    reviewAge,
    drift,
  };
}

// ----- index fix (SPEC-0064) -----

const ENTRY = /^\s*[-*]\s+\[(?:\\.|[^\]\\])*\]\(\s*<?([^)\s>]+)/;
const SECTION_HEADINGS = { documents: /^##\s+(Documents|Concepts)\s*$/i, sections: /^##\s+(Sections|Folders)\s*$/i };
const NEW_SECTION = { documents: '## Documents', sections: '## Sections' };

const oneLine = (s) => String(s).replace(/\s+/g, ' ').trim();
/** Link text with `\`, `[` and `]` escaped; a target with spaces and parentheses percent-encoded. */
const entryLine = (title, target, description) => {
  const text = oneLine(title).replace(/[\\[\]]/g, (c) => `\\${c}`);
  const href = encodeURI(target).replace(/\(/g, '%28').replace(/\)/g, '%29');
  return `- [${text}](${href})${description ? ` — ${oneLine(description)}` : ''}`;
};
/** The description line of an index the fix creates; the parent's entry uses the same text. */
const createdSummary = (bundle, dir) => `Documents in ${relative(bundle, dir).split(sep).join('/')}/.`;
/** "use-cases" → "Use cases". */
const folderTitle = (dir) => {
  const name = dir.split(sep).pop().replace(/[-_]+/g, ' ');
  return name.charAt(0).toUpperCase() + name.slice(1);
};
/** The first `# ` heading of a markdown file, or null. */
function headingOf(file) {
  const { body } = parseFrontMatter(readFileSync(file, 'utf8'));
  return body.match(/^#\s+(.+?)\s*$/m)?.[1] ?? null;
}
/** The first prose line of an index: not a heading, list item, back link or blank. */
function summaryOf(file) {
  const { body } = parseFrontMatter(readFileSync(file, 'utf8'));
  return body.split(/\r?\n/).map((l) => l.trim())
    .find((l) => l && !l.startsWith('#') && !/^[-*]\s/.test(l) && !/^back to /i.test(l)) ?? '';
}

/**
 * The entries each folder index misses: concepts in the folder and sub-folder indexes it does not
 * link (the OKF-INDEX rule). A folder with concepts but no index.md gets `created: true`; the root
 * index is never created. Sorted by index path, entries by title.
 * @returns [{ index, created, documents: [line], sections: [line] }]
 */
export function planIndexFixes(bundleDir) {
  const bundle = resolve(bundleDir);
  const rel = (p) => relative(bundle, p).split(sep).join('/');
  const { files, dirs } = walk(bundle);
  const concepts = files.filter((p) => !RESERVED.has(p.split(sep).pop()));
  const indexDirs = dirs.filter((d) => d === bundle || concepts.some((c) => c.startsWith(d + sep)));
  const byTitle = (a, b) => a.title.localeCompare(b.title);
  const changes = [];

  for (const d of indexDirs) {
    const indexPath = join(d, 'index.md');
    const exists = existsSync(indexPath);
    if (!exists && d === bundle) continue;
    const body = exists ? parseFrontMatter(readFileSync(indexPath, 'utf8')).body : '';
    const linked = new Set(linkTargets(body).map((t) => resolveLink(bundle, indexPath, t)).filter(Boolean).map((p) => resolve(p)));

    const documents = concepts
      .filter((c) => dirname(c) === d && !linked.has(c))
      .map((c) => {
        const fm = parseFrontMatter(readFileSync(c, 'utf8')).fm ?? {};
        const name = c.split(sep).pop();
        const title = typeof fm.title === 'string' && fm.title.trim() ? fm.title : name.replace(/\.md$/, '');
        return { title, line: entryLine(title, name, typeof fm.description === 'string' ? fm.description : '') };
      })
      .sort(byTitle).map((e) => e.line);
    const sections = indexDirs
      .filter((s) => s !== d && dirname(s) === d && !linked.has(join(s, 'index.md')))
      .map((s) => {
        const subIndex = join(s, 'index.md');
        const has = existsSync(subIndex);
        const title = (has && headingOf(subIndex)) || folderTitle(s);
        return { title, line: entryLine(title, `${s.split(sep).pop()}/index.md`, has ? summaryOf(subIndex) : createdSummary(bundle, s)) };
      })
      .sort(byTitle).map((e) => e.line);

    if (!exists || documents.length || sections.length) changes.push({ index: rel(indexPath), created: !exists, documents, sections });
  }
  return changes.sort((a, b) => a.index.localeCompare(b.index));
}

/**
 * Writes a plan from planIndexFixes. Only adds lines: an entry goes after the last entry of its kind,
 * else at the end of its section (Documents/Concepts, Sections/Folders), else into a new section at
 * the end. A created index gets a title and a back link. The file's line ending is kept.
 */
export function applyIndexFixes(bundleDir, plan) {
  const bundle = resolve(bundleDir);
  for (const change of plan) {
    const indexPath = resolve(bundle, ...change.index.split('/'));
    if (!indexPath.startsWith(bundle + sep) || indexPath.split(sep).pop() !== 'index.md') {
      throw new Error(`not an index inside the bundle: ${change.index}`);
    }
    let text;
    if (existsSync(indexPath)) text = readFileSync(indexPath, 'utf8');
    else {
      const parentIndex = join(dirname(dirname(indexPath)), 'index.md');
      const parent = (existsSync(parentIndex) && headingOf(parentIndex)) || 'parent index';
      text = `# ${folderTitle(dirname(indexPath))}\n\n${createdSummary(bundle, dirname(indexPath))}\n\nBack to the [${parent}](../index.md).\n`;
    }
    const fixed = insertEntries(insertEntries(text, change.documents, 'documents'), change.sections, 'sections');
    if (fixed !== text || !existsSync(indexPath)) writeFileSync(indexPath, fixed);
  }
}

function insertEntries(text, entries, kind) {
  if (!entries.length) return text;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(eol);
  const isKind = (line) => {
    const m = line.match(ENTRY);
    if (!m || /^[a-z][a-z0-9+.-]*:/i.test(m[1]) || m[1].startsWith('#') || m[1].startsWith('../')) return false;
    const isIndex = /(^|\/)index\.md$/.test(m[1].replace(/[#?].*$/, ''));
    return kind === 'sections' ? isIndex : !isIndex;
  };

  let at = lines.findLastIndex(isKind) + 1;
  if (at === 0) {
    const heading = lines.findIndex((l) => SECTION_HEADINGS[kind].test(l));
    if (heading >= 0) {
      const next = lines.findIndex((l, i) => i > heading && l.startsWith('#'));
      at = next < 0 ? lines.length : next;
      while (at - 1 > heading && lines[at - 1].trim() === '') at--;
      if (at === heading + 1) { lines.splice(at, 0, ''); at++; }
    } else {
      while (lines.length && lines[lines.length - 1] === '') lines.pop();
      lines.push('', NEW_SECTION[kind], '');
      at = lines.length;
      lines.push('');
    }
  }
  lines.splice(at, 0, ...entries);
  return lines.join(eol);
}

// ----- CLI -----

const USAGE = 'usage: okf-check <bundleDir> [--repo <repositoryRoot>] [--json] [--fix-indexes [--dry-run]]';

function main(argv) {
  const repoAt = argv.indexOf('--repo');
  const repo = repoAt >= 0 ? argv[repoAt + 1] : undefined;
  const rest = argv.filter((_, i) => repoAt < 0 || (i !== repoAt && i !== repoAt + 1));
  const flags = new Set(rest.filter((a) => a.startsWith('--')));
  const dir = rest.filter((a) => !a.startsWith('--'))[0];
  const unknown = [...flags].filter((f) => !['--json', '--fix-indexes', '--dry-run'].includes(f));
  if (!dir || unknown.length || !existsSync(dir) || !statSync(dir).isDirectory() || (repoAt >= 0 && (!repo || !existsSync(repo)))) {
    console.error(USAGE);
    return 2;
  }
  if (flags.has('--fix-indexes')) {
    const dryRun = flags.has('--dry-run');
    const changes = planIndexFixes(dir);
    if (!dryRun) applyIndexFixes(dir, changes);
    if (flags.has('--json')) {
      console.log(JSON.stringify({ applied: !dryRun, changes }));
      return 0;
    }
    if (!changes.length) {
      console.log('okf-check: no index changes needed');
      return 0;
    }
    for (const c of changes) {
      for (const line of [...c.documents, ...c.sections]) console.log(`FIX ${c.index}${c.created ? ' (new)' : ''} + ${line}`);
    }
    const entries = changes.reduce((n, c) => n + c.documents.length + c.sections.length, 0);
    console.log(`okf-check: ${entries} entr${entries === 1 ? 'y' : 'ies'} in ${changes.length} index(es) ${dryRun ? 'to add (dry run)' : 'added'}`);
    return 0;
  }
  if (flags.has('--dry-run')) {
    console.error(USAGE);
    return 2;
  }
  const result = checkBundle(dir, { repo });
  if (flags.has('--json')) {
    const { concepts, errors, warnings, stats } = result;
    console.log(JSON.stringify({ concepts, errors, warnings, stats }));
    return errors.length ? 1 : 0;
  }
  const { concepts, errors, warnings } = result;
  for (const e of errors) console.log(`ERROR ${e.file} [${e.rule}]: ${e.message}`);
  for (const w of warnings) console.log(`WARN  ${w.file} [${w.rule}]: ${w.message}`);
  console.log(`okf-check: ${concepts} concepts, ${errors.length} error(s), ${warnings.length} warning(s)`);
  return errors.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
