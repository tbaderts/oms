// Coverage of the structured knowledge base against the code and contracts (SPEC-0010).
// Each extractor names the source it mirrors; sanity assertions make a broken extractor fail loudly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { spawnSync } from 'node:child_process';
import { ARCHIVE_DIR, FR_DIR, NFR_DIR, SKIP_ROOT_DIRS, linkTargets, parseFrontMatter } from '../okf-check.mjs';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const KB = join(REPO, 'oms-knowledge-base');
const AVRO = join(REPO, 'oms-contracts/src/main/avro');
const OPENAPI = join(REPO, 'oms-contracts/src/main/openapi');
const CORE = join(REPO, 'oms-core/src/main');
const read = (p) => readFileSync(p, 'utf8');
const rel = (p) => relative(KB, p).split(sep).join('/');

// ----- bundle -----

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name.startsWith('.') || e.name === 'node_modules' || (dir === KB && SKIP_ROOT_DIRS.has(e.name)) ? [] : walk(p);
    return e.name.endsWith('.md') ? [p] : [];
  });
}
const FILES = walk(KB);
const DOCS = new Map(FILES.map((p) => [p, parseFrontMatter(read(p))]));
const ofType = (...types) => [...DOCS].filter(([, d]) => types.includes(d.fm?.type));

/** Same resolution as okf-check: `/x` is bundle-relative, anchors and external links dropped. */
function resolveLink(from, target) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) return null;
  let path = target.replace(/[#?].*$/, '');
  try { path = decodeURIComponent(path); } catch { /* keep raw */ }
  if (!path) return null;
  const abs = path.startsWith('/') ? join(KB, path) : resolve(dirname(from), path);
  return existsSync(join(abs, 'index.md')) && !abs.endsWith('.md') ? join(abs, 'index.md') : abs;
}
const outLinks = (p) => linkTargets(DOCS.get(p).body).map((t) => resolveLink(p, t)).filter(Boolean);

// ----- extractors -----

/** oms-contracts/src/main/avro/*.avsc: every schema, and the command records (records named *Cmd). */
const avroSchemas = readdirSync(AVRO).filter((f) => f.endsWith('.avsc')).map((f) => JSON.parse(read(join(AVRO, f))));
const commandSchemas = avroSchemas.filter((s) => s.type === 'record' && s.name.endsWith('Cmd')).map((s) => s.name);

/**
 * Commands dispatched by oms-core. REST (CommandController), Kafka (CommandListener) and the
 * scheduler all go through CommandDispatcher (SPEC-0046): its own instanceof routes plus every
 * command OrderLifecycleCommandProcessor#supports accepts. Anything else is refused as unsupported.
 */
const instanceOfCmds = (file) => [...read(join(CORE, file)).matchAll(/instanceof\s+(\w+Cmd)\b/g)].map((m) => m[1]);
const dispatched = new Set([
  ...instanceOfCmds('java/org/example/oms/service/command/CommandDispatcher.java'),
  ...instanceOfCmds('java/org/example/oms/service/lifecycle/OrderLifecycleCommandProcessor.java'),
]);

/** Interface items: OpenAPI paths, controller base paths, Avro schemas, Kafka topics of oms-core. */
function expectedInterfaceItems() {
  const items = [];
  for (const f of readdirSync(OPENAPI).filter((f) => /^oms-(cmd|query)-api\.ya?ml$/.test(f))) {
    for (const path of Object.keys(yaml.load(read(join(OPENAPI, f))).paths || {})) items.push(`openapi:${path}`);
  }
  // every @RestController / @Controller anywhere in oms-core; its class-level @RequestMapping is the item
  for (const file of javaFiles(join(CORE, 'java'))) {
    const src = read(file);
    if (!/^@(Rest)?Controller\b/m.test(src)) continue;
    const header = src.split(/\bpublic\s+class\b/)[0];
    const m = header.match(/@RequestMapping\(\s*(?:value\s*=\s*)?"([^"]+)"/);
    // a controller with only method-level mappings would escape this inventory: fail loudly instead
    assert.ok(m, `${relative(REPO, file)}: controller without class-level @RequestMapping; extend the extractor`);
    items.push(`http:${m[1]}`);
  }
  for (const s of avroSchemas) items.push(`avro:${s.name}`);
  // oms-core application.yml: `<name>-topic: ${VAR:default}` or `<name>-topic: literal`
  for (const m of read(join(CORE, 'resources/application.yml')).matchAll(/^\s*[\w-]+-topic:\s*(?:\$\{\w+:([^}]+)\}|([^\s#$][^\s#]*))/gm)) {
    items.push(`kafka:${(m[1] ?? m[2]).trim()}`);
  }
  return items;
}

function javaFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? javaFiles(p) : e.name.endsWith('.java') ? [p] : [];
  });
}

/** JPA entities in oms-core: classes annotated @Entity. */
function entities(dir = join(CORE, 'java')) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return entities(p);
    if (!e.name.endsWith('.java')) return [];
    const src = read(p);
    return /^@Entity\b/m.test(src) ? [src.match(/public\s+(?:abstract\s+)?class\s+(\w+)/)[1]] : [];
  });
}

// ----- sanity: the extractors see what the code has -----

test('extractors find known members', () => {
  assert.ok(commandSchemas.includes('OrderCreateCmd') && !commandSchemas.includes('Cmd'), 'command schemas');
  assert.ok(['OrderCreateCmd', 'ExecutionCreateCmd', 'OrderCancelCmd', 'OrderAcceptCmd'].every((c) => dispatched.has(c)), 'dispatched commands');
  assert.ok(!dispatched.has('ExecutionBustCmd') && !dispatched.has('QuoteCreateCmd'), 'commands without a handler are not dispatched');
  const items = expectedInterfaceItems();
  for (const known of ['openapi:/execute', 'openapi:/search', 'http:/api/orders', 'http:/api/command', 'avro:OrderCreateCmd', 'kafka:commands']) {
    assert.ok(items.includes(known), `interface items lack ${known}`);
  }
  assert.ok(entities().includes('Order') && entities().includes('OutboxMessage'), 'entities');
});

// ----- AC-2 -----

test('every command schema belongs to exactly one capability', () => {
  const caps = ofType('Capability');
  assert.ok(caps.length, 'no Capability concepts');
  const owners = new Map(commandSchemas.map((c) => [c, []]));
  for (const [p, { fm }] of caps) {
    for (const c of fm.commands || []) {
      assert.ok(owners.has(c), `${rel(p)} lists unknown command ${c}`);
      owners.get(c).push(rel(p));
    }
    const undispatched = (fm.commands || []).filter((c) => !dispatched.has(c));
    if (undispatched.length) assert.notEqual(fm.maturity, 'implemented', `${rel(p)} is implemented but ${undispatched} are not dispatched`);
  }
  for (const [c, list] of owners) assert.equal(list.length, 1, `${c} is in ${list.length} capabilities: ${list}`);
});

// ----- AC-5 -----

test('every interface item is documented exactly once', () => {
  const expected = expectedInterfaceItems();
  const covered = ofType('Interface').flatMap(([p, { fm }]) => (fm.covers || []).map((c) => [c, rel(p)]));
  const counts = new Map();
  for (const [c] of covered) counts.set(c, (counts.get(c) || 0) + 1);
  assert.deepEqual(expected.filter((x) => !counts.has(x)), [], 'undocumented interface items');
  assert.deepEqual([...counts].filter(([, n]) => n > 1).map(([c]) => c), [], 'items documented more than once');
  assert.deepEqual([...counts.keys()].filter((c) => !expected.includes(c)), [], 'documented items that do not exist');
});

// ----- AC-6 -----

test('every entity and state symbol is documented', () => {
  const documented = new Set(ofType('Domain Concept').map(([, { fm }]) => fm.entity).filter(Boolean));
  assert.deepEqual(entities().filter((e) => !documented.has(e)), [], 'entities without a Domain Concept');
  const statePage = join(KB, 'domain/model/order-state.md');
  assert.ok(existsSync(statePage), 'domain/model/order-state.md is missing');
  const body = DOCS.get(statePage).body;
  for (const schema of ['State', 'CancelState']) {
    const { symbols } = avroSchemas.find((s) => s.name === schema);
    const missing = symbols.filter((sym) => !new RegExp(`\\b${sym}\\b`).test(body));
    assert.deepEqual(missing, [], `${schema} symbols missing from domain/model/order-state.md`);
  }
});

// ----- AC-7 -----

test('every concept is reachable and every spec is linked from a capability', () => {
  const root = join(KB, 'index.md');
  const seen = new Set([root]);
  const queue = [root];
  while (queue.length) {
    for (const t of outLinks(queue.shift())) {
      if (DOCS.has(t) && !seen.has(t)) { seen.add(t); queue.push(t); }
    }
  }
  assert.deepEqual(FILES.filter((p) => !seen.has(p)).map(rel), [], 'unreachable from index.md');

  // product specifications (domain, framework, UI) back a capability; architecture, tooling,
  // delivery, infrastructure and semantic-layer papers do not have to (SPEC-0061)
  const linkedFromCapability = new Set(ofType('Capability').flatMap(([p]) => outLinks(p)));
  const productFolders = ['domain/', 'framework/', 'ui/'];
  const unlinked = ofType('Specification', 'Concept Paper').map(([p]) => p)
    .filter((p) => productFolders.some((f) => rel(p).startsWith(f)))
    .filter((p) => !linkedFromCapability.has(p));
  assert.deepEqual(unlinked.map(rel), [], 'specifications and concept papers not linked from any capability');
});

// ----- AC-9 -----

/** Port of developer-cockpit RequirementsService#scanDocuments: non-recursive readdir of <kb>/<folder>. */
function cockpitScan(folder) {
  const dir = join(KB, folder);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => {
    const { fm } = parseFrontMatter(read(join(dir, f)));
    return { file: `${folder}/${f}`, id: fm?.id, title: fm?.title, priority: fm?.priority };
  });
}

test('cockpit requirement scan finds every requirement', () => {
  const requirements = ofType('Requirement');
  assert.ok(requirements.length, 'no Requirement concepts');
  const found = new Map([...cockpitScan(FR_DIR), ...cockpitScan(NFR_DIR)]
    .map((r) => [r.file, r]));
  for (const [p, { fm }] of requirements) {
    const r = found.get(rel(p));
    assert.ok(r, `${rel(p)} is not found by the cockpit scan`);
    assert.deepEqual({ id: r.id, title: r.title, priority: r.priority }, { id: fm.id, title: fm.title, priority: fm.priority }, rel(p));
  }
});

// ----- SPEC-0061 AC-1 -----

/** Top-level entries allowed at the bundle root (untracked render output inside them is fine). */
const ROOT_FILES = ['index.md', 'log.md', 'okf-conventions.md'];
const ROOT_DIRS = ['architecture', 'framework', 'domain', 'capabilities', 'tools', 'delivery', 'infrastructure', 'ui', 'semantic-layer', ARCHIVE_DIR, 'storyboards', 'animations'];

test('bundle root has only the target layout', () => {
  const entries = readdirSync(KB, { withFileTypes: true }).filter((e) => !e.name.startsWith('.'));
  const files = entries.filter((e) => e.isFile()).map((e) => e.name).sort();
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  assert.deepEqual(files, [...ROOT_FILES].sort(), 'files at the bundle root');
  assert.deepEqual(dirs.filter((d) => !ROOT_DIRS.includes(d)), [], 'unexpected folders at the bundle root');
  for (const legacy of ['oms-concepts', 'oms-framework', 'oms-methodolgy']) assert.ok(!existsSync(join(KB, legacy)), `${legacy} still exists`);
});

// ----- SPEC-0061 AC-2 -----

/** The commit SPEC-0061 started from: the knowledge base before the reorganisation. */
const BASE_COMMIT = '33f4e20';
const REGISTER = join(KB, 'semantic-layer/kb-review-2026-11.md');
const DISPOSITIONS = new Set(['keep', 'update', 'merge', 'archive', 'delete']);

/** Rows of the register table: | Old path | Disposition | New path | Notes |, cells plain or in backticks. */
export function registerRows(text = read(REGISTER)) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split('|').slice(1, -1).map((c) => c.trim().replace(/^`|`$/g, ''));
    if (cells.length < 3 || !/\.md$/.test(cells[0])) continue;
    rows.push({ old: cells[0], disposition: cells[1], next: cells[2] });
  }
  return rows;
}

test('review register covers every pre-reorganisation document', () => {
  assert.ok(existsSync(REGISTER), 'semantic-layer/kb-review-2026-11.md is missing');
  const r = spawnSync('git', ['ls-tree', '-r', '--name-only', BASE_COMMIT, '--', 'oms-knowledge-base'], { cwd: REPO, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const before = r.stdout.split('\n').filter((f) => f.endsWith('.md')).map((f) => f.slice('oms-knowledge-base/'.length));
  assert.ok(before.length > 100, `only ${before.length} documents at ${BASE_COMMIT}`);
  const rows = registerRows();
  const counts = new Map();
  for (const row of rows) counts.set(row.old, (counts.get(row.old) || 0) + 1);
  assert.deepEqual(before.filter((f) => counts.get(f) !== 1), [], 'documents not in the register exactly once');
  for (const row of rows.filter((x) => before.includes(x.old))) {
    assert.ok(DISPOSITIONS.has(row.disposition), `${row.old}: disposition "${row.disposition}"`);
    if (row.disposition === 'delete') continue;
    assert.ok(row.next && existsSync(join(KB, row.next)), `${row.old}: new path "${row.next}" does not exist`);
  }
});
