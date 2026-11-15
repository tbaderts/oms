#!/usr/bin/env node
/**
 * Finds references to knowledge base paths that no longer exist (SPEC-0061).
 *
 *   node tools/okf-check/check-kb-refs.mjs [repositoryRoot]
 *
 * Scans the text files git tracks (plus untracked, not ignored ones) for `oms-knowledge-base/<path>`
 * (as a link, a `file:///` URL or plain text) and fails when the path does not exist; test sources are
 * exempt from that part, since their fixtures name paths in temporary workspaces. Also fails on any
 * mention of the retired top-level folders (oms-concepts/, oms-framework/, oms-methodolgy/), tests included.
 * Historical records are excluded: archived and in-flight spec tickets, OpenWiki, the KB archive,
 * the review register and the KB log. Prints `REF <file>:<line>: <message>`; exit 0 clean, 1
 * findings, 2 usage.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TEXT = /\.(md|mdx|java|kt|ts|tsx|js|jsx|mjs|cjs|json|ya?ml|ps1|sh|gradle|txt|html|css|scss|properties|xml)$/i;

/** Path prefixes (repository-relative, '/'-separated) that are history or tooling, not live references. */
export const EXCLUDED = [
  'specs/archive/',
  'specs/changes/',
  'openwiki/',
  'oms-knowledge-base/archive/',
  'oms-knowledge-base/semantic-layer/kb-review-2026-11.md',
  'oms-knowledge-base/log.md',
  'oms-knowledge-base/okf-conventions.md',
  'tools/okf-check/check-kb-refs.mjs',
  'tools/okf-check/README.md',
  'tools/okf-check/test/',
  // dated assessments are point-in-time records: they cite the paths of their day
  'oms-knowledge-base/architecture/assessments/',
  // applied Liquibase changesets are never edited (policy P-07), comments included
  'oms-core/src/main/resources/db/changelog/',
];

const KB_REF = /oms-knowledge-base\/([\w./-]*[\w/-])/g;
/** Test sources build throw-away workspaces whose knowledge base paths never exist in the repository. */
const TEST_SOURCE = /(^|\/)(test|tests|src\/test)\/|\.test\.[cm]?[jt]sx?$|Test\.java$/;
const LEGACY = /\b(oms-concepts|oms-framework|oms-methodolgy)\//g;
const CORE_DOCS = /oms-core\/docs\/([\w./-]*[\w/-])/g;
const REGISTER = 'oms-knowledge-base/semantic-layer/kb-review-2026-11.md';

/**
 * File names the review register retired: the old name of a moved or archived document, when no
 * current (non-archived) document of the knowledge base carries that name (e.g. domain-model_spec.md).
 */
export function retiredNames(root) {
  const reg = join(root, REGISTER);
  if (!existsSync(reg)) return [];
  const kb = join(root, 'oms-knowledge-base');
  const current = new Set();
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { if (!(dir === kb && e.name === 'archive')) walk(join(dir, e.name)); }
      else current.add(e.name);
    }
  };
  walk(kb);
  const names = new Set();
  for (const line of readFileSync(reg, 'utf8').split(/\r?\n/)) {
    const cells = line.split('|').slice(1, -1).map((c) => c.trim().replace(/^`|`$/g, ''));
    if (cells.length < 3 || !cells[0].endsWith('.md')) continue;
    const name = cells[0].split('/').pop();
    if (name !== 'index.md' && !current.has(name)) names.add(name);
  }
  return [...names];
}

const escapeRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Tracked and untracked-but-not-ignored files, repository-relative. */
export function repoFiles(root) {
  const r = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ls-files failed: ${r.stderr}`);
  return r.stdout.split('\n').filter(Boolean);
}

/**
 * @param root repository root
 * @param files repository-relative files to scan (default: git ls-files)
 * @returns findings { file, line, message }
 */
export function findDanglingRefs(root, files = repoFiles(root)) {
  const findings = [];
  // a name preceded by a word character, dot or hyphen is part of a longer name (oms.agent.md)
  const retired = retiredNames(root).map((n) => [n, new RegExp(`(?<![\\w.-])${escapeRe(n)}`)]);
  for (const file of files) {
    const rel = file.split('\\').join('/');
    if (!TEXT.test(rel) || EXCLUDED.some((x) => rel === x || rel.startsWith(x))) continue;
    const abs = join(root, rel);
    if (!existsSync(abs) || !statSync(abs).isFile()) continue;
    const lines = readFileSync(abs, 'utf8').split(/\r?\n/);
    lines.forEach((text, i) => {
      // a moved concept names its former ids on purpose (SPEC-0061)
      if (rel.endsWith('.md') && /^aliases:/.test(text)) return;
      for (const m of TEST_SOURCE.test(rel) ? [] : text.matchAll(KB_REF)) {
        const target = m[1].replace(/[.]+$/, '');
        if (!target) continue;
        if (!existsSync(join(root, 'oms-knowledge-base', target))) {
          findings.push({ file: rel, line: i + 1, message: `oms-knowledge-base/${target} does not exist` });
        }
      }
      const legacy = [...text.matchAll(LEGACY)];
      for (const m of legacy) {
        findings.push({ file: rel, line: i + 1, message: `retired knowledge base folder ${m[1]}/` });
      }
      // the old name of a moved document written on its own (agent profiles, prose); a line that
      // already names a retired folder is reported once, above
      if (!legacy.length) {
        for (const [name, re] of retired) {
          if (re.test(text)) findings.push({ file: rel, line: i + 1, message: `retired knowledge base file name ${name}` });
        }
      }
      // architecture documents moved out of oms-core/docs into the knowledge base (SPEC-0061)
      for (const m of TEST_SOURCE.test(rel) ? [] : text.matchAll(CORE_DOCS)) {
        const target = m[1].replace(/[.]+$/, '');
        if (target && !existsSync(join(root, 'oms-core', 'docs', target))) {
          findings.push({ file: rel, line: i + 1, message: `oms-core/docs/${target} does not exist` });
        }
      }
    });
  }
  return findings;
}

function main(argv) {
  const root = resolve(argv[0] ?? fileURLToPath(new URL('../../', import.meta.url)));
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    console.error('usage: check-kb-refs [repositoryRoot]');
    return 2;
  }
  const findings = findDanglingRefs(root);
  for (const f of findings) console.log(`REF ${f.file}:${f.line}: ${f.message}`);
  console.log(`check-kb-refs: ${findings.length} finding(s)`);
  return findings.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
