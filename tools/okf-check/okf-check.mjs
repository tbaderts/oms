#!/usr/bin/env node
/**
 * OKF v0.2 conformance checker for the OMS knowledge base.
 *
 *   node tools/okf-check/okf-check.mjs <bundleDir> [--repo <repositoryRoot>]
 *
 * Checks OKF §11 conformance plus the project rules from SPEC-0009 and SPEC-0010 (see README.md
 * for the rule table). `repo:` sources resolve against --repo (default: the bundle's parent). Prints `ERROR <file> [<rule>]: <message>` per finding; exit 0 clean, 1 errors, 2 usage.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
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
    for (const m of text.matchAll(/\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) targets.push(m[1]);
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
 */
export function checkBundle(bundleDir, { repo } = {}) {
  const bundle = resolve(bundleDir);
  const repoRoot = resolve(repo ?? dirname(bundle));
  const rel = (p) => relative(bundle, p).split(sep).join('/');
  const errors = [];
  const warnings = [];
  const err = (p, rule, message) => errors.push({ file: rel(p), rule, message });

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

  checkStructure(bundle, repoRoot, concepts, parsed, err);
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

  return { concepts: concepts.length, errors, warnings };
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

    if (fm.type === 'Capability') {
      if (!MATURITIES.has(fm.maturity)) e('OMS-CAP', `maturity must be one of ${[...MATURITIES].join(', ')} (found ${JSON.stringify(fm.maturity)})`);
      if (!Array.isArray(fm.commands) || !fm.commands.every((c) => typeof c === 'string')) e('OMS-CAP', 'commands must be a list of command names (use [] for none)');
      const linksRequirement = linkTargets(parsed.get(p).body)
        .map((t) => resolveLink(bundle, p, t)).some((abs) => abs && typeOf(abs) === 'Requirement');
      if (!linksRequirement) e('OMS-CAP', 'must link at least one Requirement concept');
    }

    if (fm.type === 'Requirement') {
      const id = fm.id;
      const m = typeof id === 'string' ? id.match(/^(FR|NFR)-\d{3}$/) : null;
      if (!m) e('OMS-REQ', `id must match FR-nnn or NFR-nnn (found ${JSON.stringify(id)})`);
      else {
        const folder = m[1] === 'FR' ? 'functional-requirements' : 'non-functional-requirements';
        if (relative(bundle, dirname(p)).split(sep).join('/') !== folder) e('OMS-REQ', `${id} must live in ${folder}/`);
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

// ----- CLI -----

function main(argv) {
  const repoAt = argv.indexOf('--repo');
  const repo = repoAt >= 0 ? argv[repoAt + 1] : undefined;
  const dir = argv.filter((_, i) => repoAt < 0 || (i !== repoAt && i !== repoAt + 1))[0];
  if (!dir || !existsSync(dir) || !statSync(dir).isDirectory() || (repoAt >= 0 && (!repo || !existsSync(repo)))) {
    console.error('usage: okf-check <bundleDir> [--repo <repositoryRoot>]');
    return 2;
  }
  const { concepts, errors, warnings } = checkBundle(dir, { repo });
  for (const e of errors) console.log(`ERROR ${e.file} [${e.rule}]: ${e.message}`);
  for (const w of warnings) console.log(`WARN  ${w.file} [${w.rule}]: ${w.message}`);
  console.log(`okf-check: ${concepts} concepts, ${errors.length} error(s), ${warnings.length} warning(s)`);
  return errors.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
