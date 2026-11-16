// report.test.mjs - The checker's report: statistics, --json output and the freshness warnings
// (SPEC-0064, AC-2 to AC-4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { batches, checkBundle } from '../okf-check.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const VALID = here('./fixtures/valid/');
const CLI = here('../okf-check.mjs');

/** A temp copy of the valid fixture with edits ({ path: content | fn(old) | null }); the caller removes it. */
function copy(edits = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'okf-report-'));
  cpSync(VALID, dir, { recursive: true });
  for (const [rel, edit] of Object.entries(edits)) {
    const p = join(dir, rel);
    if (edit === null) { rmSync(p); continue; }
    mkdirSync(dirname(p), { recursive: true });
    const old = (() => { try { return readFileSync(p, 'utf8'); } catch { return ''; } })();
    writeFileSync(p, typeof edit === 'function' ? edit(old) : edit);
  }
  return dir;
}

function report(edits = {}, options = {}) {
  const dir = copy(edits);
  try {
    return checkBundle(dir, { repo: dir, ...options });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const cli = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

/** Front matter lines added to a fixture file, right after its opening ---. */
const withKeys = (lines) => (s) => s.replace(/^---\r?\n/, `---\n${lines}\n`);
const setUpdated = (iso) => (s) => s.replace(/^updated: .*$/m, `updated: "${iso}"`);
const reviewAfter = (days) => withKeys(`review_after_days: ${days}`);
const warningsOf = (r, rule) => r.warnings.filter((w) => w.rule === rule).map((w) => w.file);
const NOW = Date.parse('2027-01-01T00:00:00Z');

// ----- statistics (AC-3) -----

test('stats count documents by type, status, folder, requirements and review age', () => {
  const { stats } = report();
  assert.equal(stats.documents, 9); // index.md and log.md are navigation, not documents
  assert.deepEqual(stats.byType, {
    Actor: 1, Capability: 1, Decision: 1, Reference: 1, Requirement: 1, Specification: 3, 'Use Case': 1,
  });
  assert.deepEqual(stats.byStatus, { deprecated: 1, draft: 5, stable: 3 });
  assert.deepEqual(stats.byFolder, { archive: 1, capabilities: 4, decisions: 1, root: 2, sub: 1 });
  assert.deepEqual(stats.requirements, { total: 1, byImplementation: { implemented: 1 }, byPriority: { must: 1 } });
  // Without review_after_days nothing is due; only concept-a has an `updated`; the archive is left out.
  assert.deepEqual(stats.reviewAge, { reviewAfterDays: null, current: 1, due: 0, unknown: 7 });
});

test('review age splits current and due documents by review_after_days', () => {
  const { stats } = report(
    { 'okf-conventions.md': reviewAfter(30), 'sub/concept-b.md': withKeys('updated: "2026-12-20T00:00:00Z"') },
    { now: NOW },
  );
  // concept-a (2026-10-27) is older than 30 days; concept-b (2026-12-20) is not.
  assert.deepEqual(stats.reviewAge, { reviewAfterDays: 30, current: 1, due: 1, unknown: 6 });
});

test('a document without front matter counts under (none)', () => {
  const { stats } = report({ 'sub/loose.md': '# Loose\n', 'sub/index.md': (s) => `${s}\n- [Loose](loose.md)\n` });
  assert.equal(stats.documents, 10);
  assert.equal(stats.byType['(none)'], 1);
  assert.equal(stats.byStatus['(none)'], 1);
});

// ----- --json (AC-2) -----

test('--json prints errors, warnings and stats with the text exit code', () => {
  const clean = copy();
  const broken = copy({ 'sub/concept-b.md': (s) => s.replace(/^status: .*$/m, 'status: bogus') });
  try {
    for (const [dir, code] of [[clean, 0], [broken, 1]]) {
      const json = cli([dir, '--repo', dir, '--json']);
      const text = cli([dir, '--repo', dir]);
      assert.equal(json.status, code);
      assert.equal(text.status, code);
      const parsed = JSON.parse(json.stdout);
      assert.deepEqual(Object.keys(parsed).sort(), ['concepts', 'errors', 'stats', 'warnings']);
      assert.equal(parsed.concepts, 9);
      assert.equal(parsed.stats.documents, 9);
      if (code) assert.ok(parsed.errors.some((e) => e.file === 'sub/concept-b.md' && e.rule === 'OKF-STATUS'));
    }
  } finally {
    rmSync(clean, { recursive: true, force: true });
    rmSync(broken, { recursive: true, force: true });
  }
});

test('text output is unchanged without --json', () => {
  const dir = copy();
  try {
    const r = cli([dir, '--repo', dir]);
    assert.equal(r.stdout.trim(), 'okf-check: 9 concepts, 0 error(s), 0 warning(s)');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ----- freshness warnings (AC-4) -----

test('OMS-AGE warns about a document not updated within review_after_days', () => {
  const due = report({ 'okf-conventions.md': reviewAfter(30) }, { now: NOW });
  assert.deepEqual(warningsOf(due, 'OMS-AGE'), ['concept-a.md']);
  const fresh = report({ 'okf-conventions.md': reviewAfter(30), 'concept-a.md': setUpdated('2026-12-15T00:00:00Z') }, { now: NOW });
  assert.deepEqual(warningsOf(fresh, 'OMS-AGE'), []);
  // Without the setting the rule is off.
  assert.deepEqual(warningsOf(report({}, { now: NOW }), 'OMS-AGE'), []);
});

test('OMS-AGE leaves archived documents alone', () => {
  const r = report({
    'okf-conventions.md': reviewAfter(30),
    'archive/old-foo.md': withKeys('updated: "2020-01-01T00:00:00Z"'),
  }, { now: NOW });
  assert.ok(!warningsOf(r, 'OMS-AGE').includes('archive/old-foo.md'));
});

test('OMS-STALE warns once stale_after has passed', () => {
  // concept-a is stale after 2027-10-27.
  assert.deepEqual(warningsOf(report({}, { now: Date.parse('2027-11-01T00:00:00Z') }), 'OMS-STALE'), ['concept-a.md']);
  assert.deepEqual(warningsOf(report({}, { now: NOW }), 'OMS-STALE'), []);
});

test('OMS-DEPRECATED warns about a deprecated document outside archive/', () => {
  const r = report({
    'sub/concept-b.md': (s) => s.replace(/^status: .*$/m, 'status: deprecated\nsuperseded_by: none'),
  });
  assert.deepEqual(warningsOf(r, 'OMS-DEPRECATED'), ['sub/concept-b.md']);
  // The archived one (archive/old-foo.md) is where it belongs.
  assert.deepEqual(warningsOf(report(), 'OMS-DEPRECATED'), []);
});

test('warnings do not change the exit code', () => {
  const dir = copy({ 'okf-conventions.md': reviewAfter(1) }); // concept-a is older than a day
  try {
    const r = cli([dir, '--repo', dir, '--json']);
    assert.equal(r.status, 0);
    const parsed = JSON.parse(r.stdout);
    assert.ok(parsed.warnings.some((w) => w.rule === 'OMS-AGE'));
    assert.deepEqual(parsed.errors, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ----- OMS-DRIFT (AC-4): a source committed after the document was updated -----

const git = (cwd, args, date) => {
  const env = { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date };
  const r = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
};

/** A git repo holding the fixture bundle at kb/ and a source file committed at `sourceDate`. */
function driftRepo(sourceDate, docUpdated, options = {}) {
  const { docInCodeCommit = false, source = 'code/Thing.java', cited = source, extraSources = [], files = {} } = options;
  const repo = mkdtempSync(join(tmpdir(), 'okf-drift-'));
  cpSync(VALID, join(repo, 'kb'), { recursive: true });
  const conceptA = join(repo, 'kb', 'concept-a.md');
  const resources = [cited, ...extraSources].map((r) => `  - resource: "repo:${r}"\n`).join('');
  const addSource = (s) => s.replace(/^sources:\r?\n/m, () => `sources:\n${resources}`);
  writeFileSync(conceptA, setUpdated(docUpdated)(addSource(readFileSync(conceptA, 'utf8'))));
  for (const [rel, content] of Object.entries(files)) writeFileSync(join(repo, 'kb', rel), content);
  git(repo, ['init', '-q'], sourceDate);
  git(repo, ['config', 'user.email', 'test@example.com'], sourceDate);
  git(repo, ['config', 'user.name', 'Test'], sourceDate);
  git(repo, ['add', '-A'], '2026-01-01T00:00:00Z');
  git(repo, ['commit', '-q', '-m', 'bundle'], '2026-01-01T00:00:00Z');
  mkdirSync(dirname(join(repo, source)), { recursive: true });
  writeFileSync(join(repo, source), 'class Thing {}\n');
  if (docInCodeCommit) writeFileSync(conceptA, `${readFileSync(conceptA, 'utf8')}\nRevised with the code.\n`);
  git(repo, ['add', '-A'], sourceDate);
  git(repo, ['commit', '-q', '-m', 'code'], sourceDate);
  return repo;
}

test('OMS-DRIFT warns when a repo: source was committed after the document was updated', () => {
  const later = driftRepo('2026-12-01T00:00:00Z', '2026-11-01T00:00:00Z');
  const earlier = driftRepo('2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z');
  try {
    const drifted = checkBundle(join(later, 'kb'), { repo: later, now: NOW });
    assert.deepEqual(warningsOf(drifted, 'OMS-DRIFT'), ['concept-a.md']);
    assert.match(drifted.warnings.find((w) => w.rule === 'OMS-DRIFT').message, /code\/Thing\.java/);
    assert.equal(drifted.stats.drift, 'checked');
    assert.deepEqual(warningsOf(checkBundle(join(earlier, 'kb'), { repo: earlier, now: NOW }), 'OMS-DRIFT'), []);
  } finally {
    rmSync(later, { recursive: true, force: true });
    rmSync(earlier, { recursive: true, force: true });
  }
});

test('OMS-DRIFT counts a document committed with its code as up to date', () => {
  // updated says November, but the document was committed together with the December code change.
  const repo = driftRepo('2026-12-01T00:00:00Z', '2026-11-01T00:00:00Z', { docInCodeCommit: true });
  try {
    assert.deepEqual(warningsOf(checkBundle(join(repo, 'kb'), { repo, now: NOW }), 'OMS-DRIFT'), []);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

const driftOf = (repo) => warningsOf(checkBundle(join(repo, 'kb'), { repo, now: NOW }), 'OMS-DRIFT');
function withRepo(repo, body) {
  try { body(repo); } finally { rmSync(repo, { recursive: true, force: true }); }
}

test('OMS-DRIFT dates a source folder by the newest file under it', () => withRepo(
  driftRepo('2026-12-01T00:00:00Z', '2026-11-01T00:00:00Z', { source: 'code/deep/Thing.java', cited: 'code' }),
  (repo) => assert.deepEqual(driftOf(repo), ['concept-a.md']),
));

test('OMS-DRIFT matches non-ASCII source paths', () => withRepo(
  driftRepo('2026-12-01T00:00:00Z', '2026-11-01T00:00:00Z', { source: 'code/ü/Grüße.java' }),
  (repo) => assert.deepEqual(driftOf(repo), ['concept-a.md']),
));

const DRIFTY_ARCHIVED = [
  '---', 'type: Specification', 'title: Drifty', 'description: Old.', 'tags: [x]', 'status: deprecated',
  'superseded_by: none', 'updated: "2026-11-01T00:00:00Z"', 'sources:', '  - resource: "repo:code/Thing.java"', '---', '# Drifty', '',
].join('\n');

test('OMS-DRIFT leaves archived documents alone', () => withRepo(
  driftRepo('2026-12-01T00:00:00Z', '2026-11-01T00:00:00Z', { files: { 'archive/drifty.md': DRIFTY_ARCHIVED } }),
  (repo) => assert.deepEqual(driftOf(repo), ['concept-a.md']),
));

test('OMS-DRIFT handles more source paths than one command line holds', () => withRepo(
  // 600 paths of about 70 characters: some 42,000 characters, over the Windows limit of 32,767.
  driftRepo('2026-12-01T00:00:00Z', '2026-11-01T00:00:00Z', {
    extraSources: Array.from({ length: 600 }, (_, i) => `code/not-there/a-rather-long-folder-name/another-folder/File${i}.java`),
  }),
  (repo) => {
    const r = checkBundle(join(repo, 'kb'), { repo, now: NOW });
    assert.equal(r.stats.drift, 'checked');
    assert.deepEqual(warningsOf(r, 'OMS-DRIFT'), ['concept-a.md']);
  },
));

test('OMS-DRIFT still checks when a source points outside the repository (review)', () => withRepo(
  driftRepo('2026-12-01T00:00:00Z', '2026-11-01T00:00:00Z', { extraSources: ['../outside/Thing.java'] }),
  (repo) => {
    const r = checkBundle(join(repo, 'kb'), { repo, now: NOW });
    assert.equal(r.stats.drift, 'checked');
    assert.deepEqual(warningsOf(r, 'OMS-DRIFT'), ['concept-a.md']);
  },
));

test('batches keep each batch under the length limit', () => {
  assert.deepEqual(batches(['aaa', 'bb', 'c'], 6), [['aaa'], ['bb', 'c']]);
  assert.deepEqual(batches([], 6), []);
});

test('OMS-DRIFT is skipped outside a git repository', () => {
  const r = report({}, { now: NOW });
  assert.deepEqual(warningsOf(r, 'OMS-DRIFT'), []);
  assert.equal(r.stats.drift, 'unavailable');
});
