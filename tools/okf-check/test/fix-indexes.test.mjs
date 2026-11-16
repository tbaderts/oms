// fix-indexes.test.mjs - The index fix adds the links a folder index misses, and nothing else
// (SPEC-0064, AC-5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { applyIndexFixes, checkBundle, planIndexFixes } from '../okf-check.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const VALID = here('./fixtures/valid/');
const CLI = here('../okf-check.mjs');

const concept = (title, description) =>
  `---\ntype: Specification\ntitle: ${title}\ndescription: ${description}\ntags: [x]\nstatus: draft\n---\n# ${title}\n`;

const SUB = [
  '# Sub',
  '',
  'Nested concepts, kept by hand.',
  '',
  '## Concepts',
  '',
  '- [Unrelated](https://example.com) — an external link stays',
  '',
  '## Notes',
  '',
  'Prose after the list stays where it is.',
  '',
].join('\n');

const SUB_FIXED = [
  '# Sub',
  '',
  'Nested concepts, kept by hand.',
  '',
  '## Concepts',
  '',
  '- [Unrelated](https://example.com) — an external link stays',
  '- [Concept B](concept-b.md) — A nested concept.',
  '- [Concept C](concept-c.md) — The third concept.',
  '',
  '## Notes',
  '',
  'Prose after the list stays where it is.',
  '',
].join('\n');

const PLAN = [
  { index: 'extra/index.md', created: true, documents: ['- [A Thing](thing.md) — Something extra.'], sections: [] },
  { index: 'index.md', created: false, documents: [], sections: ['- [Extra](extra/index.md) — Documents in extra/.'] },
  {
    index: 'sub/index.md', created: false, sections: [],
    documents: ['- [Concept B](concept-b.md) — A nested concept.', '- [Concept C](concept-c.md) — The third concept.'],
  },
];

/**
 * The valid fixture with three index problems:
 * - sub/index.md lost its link to concept-b and does not know the new sub/concept-c;
 * - extra/ holds a concept but has no index.md, so the root index cannot link it either.
 */
function brokenBundle({ crlf = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'okf-fix-'));
  cpSync(VALID, dir, { recursive: true });
  writeFileSync(join(dir, 'sub', 'index.md'), crlf ? SUB.replace(/\n/g, '\r\n') : SUB);
  writeFileSync(join(dir, 'sub', 'concept-c.md'), concept('Concept C', 'The third concept.'));
  mkdirSync(join(dir, 'extra'));
  writeFileSync(join(dir, 'extra', 'thing.md'), concept('A Thing', 'Something extra.'));
  return dir;
}

const read = (dir, rel) => readFileSync(join(dir, rel), 'utf8');
const indexErrors = (dir) => checkBundle(dir, { repo: dir }).errors.filter((e) => e.rule.startsWith('OKF-INDEX'));
const FILES = ['index.md', 'sub/index.md', 'extra/index.md'];
const snapshot = (dir) => Object.fromEntries(FILES.map((f) => [f, existsSync(join(dir, f)) ? read(dir, f) : null]));
const fixCli = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

function withBundle(options, body) {
  const dir = brokenBundle(options);
  try { body(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('the broken bundle has the index errors the fix is for', () => withBundle({}, (dir) => {
  assert.deepEqual(indexErrors(dir).map((e) => e.file).sort(), ['extra/index.md', 'index.md', 'sub/index.md', 'sub/index.md']);
}));

test('dry run lists the entries and writes nothing', () => withBundle({}, (dir) => {
  const before = snapshot(dir);
  assert.deepEqual(planIndexFixes(dir), PLAN);
  const r = fixCli([dir, '--fix-indexes', '--dry-run', '--json']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), { applied: false, changes: PLAN });
  assert.deepEqual(snapshot(dir), before);
}));

test('apply adds the entries, keeps the text, creates a missing index and clears OKF-INDEX', () => withBundle({}, (dir) => {
  const before = snapshot(dir);
  const r = fixCli([dir, '--fix-indexes', '--json']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), { applied: true, changes: PLAN });

  // Entries go after the last entry of their kind, or at the end of their section; nothing else moves.
  assert.equal(read(dir, 'sub/index.md'), SUB_FIXED);
  const archive = '- [Archive](archive/index.md) — superseded documents\n';
  assert.equal(read(dir, 'index.md'), before['index.md'].replace(archive, `${archive}- [Extra](extra/index.md) — Documents in extra/.\n`));
  assert.equal(read(dir, 'extra/index.md'),
    '# Extra\n\nDocuments in extra/.\n\nBack to the [Fixture bundle](../index.md).\n\n## Documents\n\n- [A Thing](thing.md) — Something extra.\n');
  assert.deepEqual(indexErrors(dir), []);
}));

test('an index without a matching section gets one at the end', () => withBundle({}, (dir) => {
  writeFileSync(join(dir, 'sub', 'index.md'), '# Sub\n\nOnly prose here.\n');
  applyIndexFixes(dir, planIndexFixes(dir));
  assert.equal(read(dir, 'sub/index.md'), '# Sub\n\nOnly prose here.\n\n## Documents\n\n'
    + '- [Concept B](concept-b.md) — A nested concept.\n- [Concept C](concept-c.md) — The third concept.\n');
}));

test('a second run changes nothing', () => withBundle({}, (dir) => {
  applyIndexFixes(dir, planIndexFixes(dir));
  const after = snapshot(dir);
  assert.deepEqual(planIndexFixes(dir), []);
  applyIndexFixes(dir, planIndexFixes(dir));
  assert.deepEqual(snapshot(dir), after);
}));

test('keeps CRLF line endings', () => withBundle({ crlf: true }, (dir) => {
  applyIndexFixes(dir, planIndexFixes(dir));
  const sub = read(dir, 'sub/index.md');
  assert.equal(sub, SUB_FIXED.replace(/\n/g, '\r\n'));
}));

test('titles and file names are escaped, so the entries link and a second run adds nothing', () => withBundle({}, (dir) => {
  writeFileSync(join(dir, 'sub', 'bar(1).md'), concept('Foo [beta] \\ more', 'Odd characters.'));
  applyIndexFixes(dir, planIndexFixes(dir));
  assert.match(read(dir, 'sub/index.md'), /^- \[Foo \\\[beta\\\] \\\\ more\]\(bar%281%29\.md\) — Odd characters\.$/m);
  assert.deepEqual(planIndexFixes(dir), []);
  const errors = checkBundle(dir, { repo: dir }).errors.filter((e) => /^OKF-(INDEX|LINK)/.test(e.rule));
  assert.deepEqual(errors, []);
}));

test('a clean bundle needs no fix', () => {
  const dir = mkdtempSync(join(tmpdir(), 'okf-fix-'));
  cpSync(VALID, dir, { recursive: true });
  try {
    assert.deepEqual(planIndexFixes(dir), []);
    const r = fixCli([dir, '--fix-indexes']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /no index changes needed/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
