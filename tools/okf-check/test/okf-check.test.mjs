import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkBundle } from '../okf-check.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const VALID = here('./fixtures/valid/');
const CLI = here('../okf-check.mjs');
const REAL = here('../../../oms-knowledge-base/');

/** Copy the valid fixture to a temp dir, apply edits ({ path: content | fn(old) | null }), check it. */
function variant(edits) {
  const dir = mkdtempSync(join(tmpdir(), 'okf-'));
  cpSync(VALID, dir, { recursive: true });
  for (const [rel, edit] of Object.entries(edits)) {
    const p = join(dir, rel);
    if (edit === null) { rmSync(p); continue; }
    mkdirSync(dirname(p), { recursive: true });
    const old = (() => { try { return readFileSync(p, 'utf8'); } catch { return ''; } })();
    writeFileSync(p, typeof edit === 'function' ? edit(old) : edit);
  }
  const result = checkBundle(dir, { repo: dir });
  rmSync(dir, { recursive: true, force: true });
  return result;
}

const B = 'sub/concept-b.md';
const replaceIn = (from, to) => (s) => {
  assert.ok(s.includes(from), `fixture lacks "${from}"`);
  return s.replace(from, to);
};
const hasError = (r, file, rule) =>
  assert.ok(r.errors.some((e) => e.file === file && e.rule === rule),
    `expected ${rule} on ${file}, got ${JSON.stringify(r.errors)}`);

test('valid fixture has no findings', () => {
  const r = checkBundle(VALID, { repo: VALID });
  assert.deepEqual(r.errors, []);
  assert.equal(r.concepts, 9);
});

test('skips storyboards subtree: storyboards/ at the bundle root is not part of the bundle (SPEC-0014)', () => {
  const r = variant({
    'storyboards/README.md': '# Storyboards\n',
    'storyboards/_templates/story.md': '---\nid: {{id}}\n---\n',
    'storyboards/d/s/story.md': '---\nid: s\ntitle: S\nlanes: []\nsteps: [a]\n---\n',
    'storyboards/d/s/steps/a.md': '---\nid: a\ntitle: A\nkind: system\n---\n',
  });
  assert.deepEqual(r.errors, []);
  assert.equal(r.concepts, 9);
  // only the root-level folder is skipped; a nested folder of the same name is still checked
  const nested = variant({ 'sub/storyboards/x.md': '# no front matter\n' });
  assert.ok(nested.errors.some((e) => e.file.includes('x.md')), JSON.stringify(nested.errors));
});

const CAP = 'capabilities/capability-x.md';
const FR = 'capabilities/functional-requirements/FR-001-foo.md';
const UC = 'capabilities/use-cases/UC-001-do-foo.md';
const ACTOR = 'capabilities/actors/user.md';
const ADR = 'decisions/ADR-001-use-foo.md';
const OLD = 'archive/old-foo.md';
const CONV = 'okf-conventions.md';
const A = 'concept-a.md';
/** Conventions that switch on the review rules (OMS-REVIEWED, OMS-RETIRED). */
const reviewSettings = replaceIn('type_vocabulary:', 'reviewed_since: "2026-11-14T00:00:00Z"\nretired_terms: [ReadySet, Spring Boot 3]\ntype_vocabulary:');
/** Every concept outside archive/ reviewed on 2026-11-14. */
const reviewedEverywhere = () => Object.fromEntries(
  [A, B, CAP, FR, UC, ACTOR, ADR, CONV].map((f) => [f, (s) => s.replace(/^---\n/, '---\nupdated: "2026-11-14T09:00:00Z"\n').replace(/\nupdated: "2026-10-27T10:00:00\+02:00"/, '')]),
);

test('repository sources exist and implemented requirements cite code and tests', () => {
  hasError(variant({ [CAP]: replaceIn('repo:src/main/Foo.java', 'repo:src/main/Missing.java') }), CAP, 'OMS-SRC');
  hasError(variant({ [FR]: replaceIn('  - resource: "repo:src/test/FooTest.java"\n', '') }), FR, 'OMS-SRC');
  hasError(variant({ [FR]: replaceIn('  - resource: "repo:src/main/Foo.java"\n', '') }), FR, 'OMS-SRC');
  // a not-implemented requirement may cite only non-code sources
  const planned = variant({
    [FR]: (s) => s.replace('implementation: implemented', 'implementation: not-implemented')
      .replace('  - resource: "repo:src/main/Foo.java"\n  - resource: "repo:src/test/FooTest.java"\n', '  - resource: /concept-a.md\n'),
  });
  assert.deepEqual(planned.errors.filter((e) => e.rule === 'OMS-SRC'), []);
  // front-end layout: code under src/, tests named *.test.ts
  const frontEnd = variant({
    'web/src/app.ts': 'x', 'web/src/app.test.ts': 'x',
    [FR]: (s) => s.replace('repo:src/main/Foo.java', 'repo:web/src/app.ts').replace('repo:src/test/FooTest.java', 'repo:web/src/app.test.ts'),
  });
  assert.deepEqual(frontEnd.errors, []);
  // a test file alone is not a main source
  hasError(variant({ [FR]: replaceIn('repo:src/main/Foo.java', 'repo:src/test/FooTest.java') }), FR, 'OMS-SRC');
  // the repository root defaults to the bundle's parent: from there, repo:src/... does not exist
  const r = checkBundle(VALID);
  hasError(r, CAP, 'OMS-SRC');
});

test('new concept types carry provenance', () => {
  hasError(variant({ [CAP]: replaceIn('generated:\n  by: claude-code/claude-opus-5-5\n  at: "2026-10-27T12:00:00Z"\n', '') }), CAP, 'OMS-PROV');
  hasError(variant({ [CAP]: replaceIn('by: claude-code/claude-opus-5-5', 'by: human:tbaderts') }), CAP, 'OMS-PROV');
  hasError(variant({ [CAP]: replaceIn('  at: "2026-10-27T12:00:00Z"\n', '') }), CAP, 'OMS-PROV');
  hasError(variant({ [CAP]: replaceIn('sources:\n  - resource: "repo:src/main/Foo.java"\n', 'sources: []\n') }), CAP, 'OMS-PROV');
  // older document types are not required to carry provenance
  assert.deepEqual(variant({}).errors, []);
});

test('capability rules', () => {
  hasError(variant({ [CAP]: replaceIn('maturity: implemented\n', '') }), CAP, 'OMS-CAP');
  hasError(variant({ [CAP]: replaceIn('maturity: implemented', 'maturity: done') }), CAP, 'OMS-CAP');
  hasError(variant({ [CAP]: replaceIn('commands: [FooCmd]', 'commands: FooCmd') }), CAP, 'OMS-CAP');
  hasError(variant({ [CAP]: replaceIn('commands: [FooCmd]\n', '') }), CAP, 'OMS-CAP');
  hasError(variant({ [CAP]: replaceIn('Requirements: [FR-001 Foo](functional-requirements/FR-001-foo.md).', 'No requirements.') }), CAP, 'OMS-CAP');
  assert.deepEqual(variant({ [CAP]: replaceIn('commands: [FooCmd]', 'commands: []') }).errors, []);
});

test('requirement rules', () => {
  const FR2 = 'capabilities/functional-requirements/FR-002-bar.md';
  const addToIndex = (file) => ({
    'capabilities/functional-requirements/index.md': (s) => s + `- [x](${file.split('/').pop()}) — x\n`,
    [UC]: (s) => s + `- [x](../functional-requirements/${file.split('/').pop()})\n`,
  });
  const second = (edit = (s) => s) => ({ ...addToIndex(FR2), [FR2]: () => edit(readFileSync(join(VALID, FR), 'utf8')) });
  hasError(variant(second()), FR2, 'OMS-REQ'); // duplicate id FR-001
  hasError(variant({ [FR]: replaceIn('id: FR-001', 'id: FR-1') }), FR, 'OMS-REQ');
  hasError(variant({ [FR]: replaceIn('id: FR-001\n', '') }), FR, 'OMS-REQ');
  hasError(variant({ [FR]: replaceIn('priority: must', 'priority: high') }), FR, 'OMS-REQ');
  hasError(variant({ [FR]: replaceIn('implementation: implemented', 'implementation: done') }), FR, 'OMS-REQ');
  hasError(variant({ [FR]: replaceIn('capability: /capabilities/capability-x.md', 'capability: /capabilities/capability-y.md') }), FR, 'OMS-REQ');
  hasError(variant({ [FR]: replaceIn('capability: /capabilities/capability-x.md', 'capability: /concept-a.md') }), FR, 'OMS-REQ');
  hasError(variant({ [FR]: replaceIn('id: FR-001', 'id: NFR-001') }), FR, 'OMS-REQ'); // NFR in the FR folder
  assert.deepEqual(variant(second((s) => s.replace('id: FR-001', 'id: FR-002'))).errors, []);
});

test('rejects missing front matter, unparseable YAML and empty type', () => {
  hasError(variant({ [B]: '# Concept B\n' }), B, 'OKF-FM');
  hasError(variant({ [B]: replaceIn('tags: [nested]', 'tags: [nested') }), B, 'OKF-FM');
  hasError(variant({ [B]: replaceIn('---\n# Concept B', '# Concept B') }), B, 'OKF-FM');
  hasError(variant({ [B]: replaceIn('type: Specification', 'type: ""') }), B, 'OKF-TYPE');
  hasError(variant({ [B]: replaceIn('type: Specification\n', '') }), B, 'OKF-TYPE');
  hasError(checkBundle(here('./fixtures/empty-type/')), B, 'OKF-TYPE');
});

test('requires project keys and vocabulary', () => {
  hasError(variant({ [B]: replaceIn('title: Concept B\n', '') }), B, 'OMS-KEYS');
  hasError(variant({ [B]: replaceIn('description: A nested concept.\n', '') }), B, 'OMS-KEYS');
  hasError(variant({ [B]: replaceIn('tags: [nested]\n', '') }), B, 'OMS-KEYS');
  hasError(variant({ [B]: replaceIn('tags: [nested]', 'tags: []') }), B, 'OMS-KEYS');
  hasError(variant({ [B]: replaceIn('status: draft\n', '') }), B, 'OKF-STATUS');
  hasError(variant({ [B]: replaceIn('status: draft', 'status: Active') }), B, 'OKF-STATUS');
  hasError(variant({ [B]: replaceIn('type: Specification', 'type: Novel') }), B, 'OMS-VOCAB');
  const noConventions = variant({
    'okf-conventions.md': null,
    'index.md': replaceIn('- [Conventions](okf-conventions.md) — type vocabulary\n', ''),
  });
  hasError(noConventions, 'okf-conventions.md', 'OMS-VOCAB');
});

test('index and log rules', () => {
  hasError(variant({ 'index.md': replaceIn('---\nokf_version: "0.2"\n---\n', '') }), 'index.md', 'OKF-INDEX-ROOT');
  hasError(variant({ 'index.md': replaceIn('okf_version: "0.2"', 'okf_version: "0.2"\ntitle: x') }), 'index.md', 'OKF-INDEX-ROOT');
  hasError(variant({ 'index.md': replaceIn('okf_version: "0.2"', 'okf_version: 0.2') }), 'index.md', 'OKF-INDEX-ROOT');
  hasError(variant({ 'index.md': null }), 'index.md', 'OKF-INDEX-ROOT');
  hasError(variant({ 'sub/index.md': (s) => '---\ntitle: Sub\n---\n' + s }), 'sub/index.md', 'OKF-INDEX');
  hasError(variant({ 'sub/index.md': null, 'index.md': replaceIn('- [Sub](sub/index.md) — nested concepts\n', '') }), 'sub/index.md', 'OKF-INDEX');
  hasError(variant({ 'sub/index.md': replaceIn('- [Concept B](concept-b.md) — nested concept', '') }), 'sub/index.md', 'OKF-INDEX');
  hasError(variant({ 'index.md': replaceIn('- [Sub](sub/index.md) — nested concepts', '') }), 'index.md', 'OKF-INDEX');
  hasError(variant({ 'log.md': '# Log\n\n## 2026-10-01\n\nA.\n\n## 2026-10-27\n\nB.\n' }), 'log.md', 'OKF-LOG');
  hasError(variant({ 'log.md': '# Log\n\n## Yesterday\n\nA.\n' }), 'log.md', 'OKF-LOG');
  hasError(variant({ 'log.md': (s) => '---\ntitle: Log\n---\n' + s }), 'log.md', 'OKF-LOG');
});

test('timestamps, actors and no verified', () => {
  const A = 'concept-a.md';
  hasError(variant({ [A]: replaceIn('"2026-10-27T10:00:00+02:00"', '"2026-10-27T10:00:00"') }), A, 'OKF-TIME');
  hasError(variant({ [A]: replaceIn('"2027-10-27T00:00:00Z"', '"2027-10-27"') }), A, 'OKF-TIME');
  hasError(variant({ [A]: replaceIn('at: "2026-10-27T08:00:00Z"', 'at: "yesterday"') }), A, 'OKF-TIME');
  hasError(variant({ [A]: replaceIn('"2026-10-01T00:00:00Z"', '"2026-10-01 00:00"') }), A, 'OKF-TIME');
  hasError(variant({ [A]: replaceIn('by: human:tbaderts', 'by: bob') }), A, 'OKF-ACTOR');
  hasError(variant({ [A]: replaceIn('  by: human:tbaderts\n', '') }), A, 'OKF-ACTOR');
  hasError(variant({ [B]: replaceIn('status: draft', 'status: draft\nverified:\n  - by: human:tbaderts\n    at: "2026-10-27T08:00:00Z"') }), B, 'OMS-UNVERIFIED');
  hasError(variant({ [B]: replaceIn('status: draft', 'status: draft\nverified: { by: bob, at: "2026-10-27T08:00:00Z" }') }), B, 'OKF-ACTOR');
});

test('internal links resolve', () => {
  const r = variant({ [B]: (s) => s + '\nSee [gone](gone.md), [root gone](/nowhere/x.md) and [ok](/concept-a.md#a).\n' });
  const links = r.errors.filter((e) => e.rule === 'OKF-LINK');
  assert.equal(links.length, 2, JSON.stringify(links));
  assert.ok(links.every((e) => e.file === B));
  assert.match(links.map((e) => e.message).join(' '), /gone\.md.*\/nowhere\/x\.md/s);
});

test('internal links must stay in the bundle and point to files or folders with an index', () => {
  const r = variant({
    'empty-dir/.keep': '',
    [B]: (s) => s + '\n[folder ok](../sub/) [folder no index](../empty-dir/) [escape](../../outside.md)\n',
  });
  const links = r.errors.filter((e) => e.rule === 'OKF-LINK').map((e) => e.message);
  assert.equal(links.length, 2, JSON.stringify(links));
  assert.match(links.join(' '), /empty-dir.*outside\.md/s);
});

test('CLI prints ERROR lines and exits non-zero on errors, zero when clean', () => {
  const ok = spawnSync(process.execPath, [CLI, VALID, "--repo", VALID], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  const bad = spawnSync(process.execPath, [CLI, here('./fixtures/empty-type/')], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /^ERROR sub\/concept-b\.md \[OKF-TYPE\]: /m);
  const missing = spawnSync(process.execPath, [CLI, here('./fixtures/does-not-exist/')], { encoding: 'utf8' });
  assert.equal(missing.status, 2);
});

test('real bundle conforms', () => {
  const r = checkBundle(REAL);
  assert.deepEqual(r.errors.map((e) => `${e.file} [${e.rule}] ${e.message}`), []);
  assert.ok(r.concepts >= 33, `only ${r.concepts} concepts parsed`);
});

// ----- SPEC-0061 rules -----

const only = (r, rule) => r.errors.filter((e) => e.rule === rule);

test('use case rules (OMS-UC)', () => {
  hasError(variant({ [UC]: replaceIn('id: UC-001', 'id: UC-1') }), UC, 'OMS-UC');
  hasError(variant({ [UC]: replaceIn('id: UC-001\n', '') }), UC, 'OMS-UC');
  hasError(variant({ [UC]: replaceIn('actors: [/capabilities/actors/user.md]', 'actors: []') }), UC, 'OMS-UC');
  hasError(variant({ [UC]: replaceIn('actors: [/capabilities/actors/user.md]', 'actors: [/concept-a.md]') }), UC, 'OMS-UC');
  hasError(variant({ [UC]: replaceIn('capability: /capabilities/capability-x.md', 'capability: /concept-a.md') }), UC, 'OMS-UC');
  hasError(variant({ [UC]: replaceIn('- [FR-001 Foo is handled](../functional-requirements/FR-001-foo.md)', 'None.') }), UC, 'OMS-UC');
  // file name must start with the id, and the folder is fixed
  hasError(variant({ [UC]: replaceIn('id: UC-001', 'id: UC-002') }), UC, 'OMS-UC');
  const UC2 = 'sub/UC-002-elsewhere.md';
  hasError(variant({
    [UC2]: () => readFileSync(join(VALID, UC), 'utf8').replace('id: UC-001', 'id: UC-002').replace('../functional-requirements/', '../capabilities/functional-requirements/'),
    'sub/index.md': (s) => s + '- [UC-002](UC-002-elsewhere.md) — x\n',
  }), UC2, 'OMS-UC');
  // ids are unique: a second UC-001 in the folder fails
  const DUP = 'capabilities/use-cases/UC-001-again.md';
  const dup = variant({
    [DUP]: () => readFileSync(join(VALID, UC), 'utf8'),
    'capabilities/use-cases/index.md': (s) => s + '- [UC-001 again](UC-001-again.md) — x\n',
  });
  assert.ok(dup.errors.some((e) => e.rule === 'OMS-UC' && /duplicate id UC-001/.test(e.message)), JSON.stringify(dup.errors));
});

test('actor rules (OMS-ACTOR)', () => {
  hasError(variant({ [ACTOR]: replaceIn('kind: human', 'kind: robot') }), ACTOR, 'OMS-ACTOR');
  hasError(variant({ [ACTOR]: replaceIn('kind: human\n', '') }), ACTOR, 'OMS-ACTOR');
});

test('decision rules (OMS-ADR)', () => {
  hasError(variant({ [ADR]: replaceIn('id: ADR-001', 'id: ADR-1') }), ADR, 'OMS-ADR');
  hasError(variant({ [ADR]: replaceIn('id: ADR-001\n', '') }), ADR, 'OMS-ADR');
  hasError(variant({ [ADR]: replaceIn('id: ADR-001', 'id: ADR-002') }), ADR, 'OMS-ADR');
});

test('capabilities link a use case and every requirement is traced to one (OMS-CAP, OMS-TRACE)', () => {
  hasError(variant({ [CAP]: replaceIn('Use cases: [UC-001 Do foo](use-cases/UC-001-do-foo.md).', 'No use cases.') }), CAP, 'OMS-CAP');
  hasError(variant({ [UC]: replaceIn('- [FR-001 Foo is handled](../functional-requirements/FR-001-foo.md)', 'See [the capability](../capability-x.md).') }), FR, 'OMS-TRACE');
});

test('requirements live under capabilities/ (OMS-REQ)', () => {
  const moved = 'functional-requirements/FR-009-root.md';
  const r = variant({
    [moved]: () => readFileSync(join(VALID, FR), 'utf8').replace('id: FR-001', 'id: FR-009').replace('../capability-x.md', '../capabilities/capability-x.md'),
    'functional-requirements/index.md': '# FR\n\n- [FR-009](FR-009-root.md) — x\n',
    'index.md': (s) => s + '- [FR](functional-requirements/index.md) — x\n',
  });
  hasError(r, moved, 'OMS-REQ');
});

test('review date applies outside archive/ when the conventions set it (OMS-REVIEWED)', () => {
  // off by default: the valid fixture has no reviewed_since
  assert.deepEqual(only(variant({}), 'OMS-REVIEWED'), []);
  const clean = variant({ ...reviewedEverywhere(), [CONV]: (s) => reviewSettings(s.replace(/^---\n/, '---\nupdated: "2026-11-14T09:00:00Z"\n')) });
  assert.deepEqual(clean.errors, [], 'every concept reviewed: no errors');
  const missing = variant({ [CONV]: reviewSettings });
  hasError(missing, B, 'OMS-REVIEWED'); // no updated at all
  hasError(missing, A, 'OMS-REVIEWED'); // updated before reviewed_since
  assert.ok(!missing.errors.some((e) => e.file === OLD && e.rule === 'OMS-REVIEWED'), 'archive/ is exempt');
});

test('retired terms may not appear in prose outside archive/ (OMS-RETIRED)', () => {
  const base = { ...reviewedEverywhere(), [CONV]: (s) => reviewSettings(s.replace(/^---\n/, '---\nupdated: "2026-11-14T09:00:00Z"\n')) };
  const withB = (edit) => variant({ ...base, [B]: (s) => edit(base[B](s)) });
  hasError(withB((s) => s + '\nThe read store is readyset.\n'), B, 'OMS-RETIRED'); // case-insensitive
  hasError(withB((s) => s + '\nBuilt on Spring Boot 3.\n'), B, 'OMS-RETIRED');
  assert.deepEqual(withB((s) => s + '\n```\nReadySet\n```\n\nThe `ReadySet` name.\n').errors, [], 'code is exempt');
  assert.deepEqual(withB((s) => s.replace('status: draft', 'status: draft\npoint_in_time: true') + '\nOld: ReadySet.\n').errors, [], 'point-in-time records are exempt');
  // the archive document mentions ReadySet and is exempt
  assert.ok(!variant(base).errors.some((e) => e.rule === 'OMS-RETIRED'));
});

test('archive documents are deprecated and say what replaced them (OMS-ARCHIVE)', () => {
  hasError(variant({ [OLD]: replaceIn('status: deprecated', 'status: draft') }), OLD, 'OMS-ARCHIVE');
  hasError(variant({ [OLD]: replaceIn('superseded_by: /capabilities/capability-x.md\n', '') }), OLD, 'OMS-ARCHIVE');
  hasError(variant({ [OLD]: replaceIn('superseded_by: /capabilities/capability-x.md', 'superseded_by: /gone.md') }), OLD, 'OMS-ARCHIVE');
  assert.deepEqual(variant({ [OLD]: replaceIn('superseded_by: /capabilities/capability-x.md', 'superseded_by: none') }).errors, []);
  // deprecated outside archive/ without superseded_by
  hasError(variant({ [B]: replaceIn('status: draft', 'status: deprecated') }), B, 'OMS-ARCHIVE');
});

test('aliases are unique and do not shadow a concept (OMS-ALIAS)', () => {
  hasError(variant({ [B]: replaceIn('status: draft', 'status: draft\naliases: [sub/old-foo]') }), B, 'OMS-ALIAS');
  hasError(variant({ [B]: replaceIn('status: draft', 'status: draft\naliases: [concept-a]') }), B, 'OMS-ALIAS');
  hasError(variant({ [B]: replaceIn('status: draft', 'status: draft\naliases: old-b') }), B, 'OMS-ALIAS');
  assert.deepEqual(variant({ [B]: replaceIn('status: draft', 'status: draft\naliases: [old/b]') }).errors, []);
});
