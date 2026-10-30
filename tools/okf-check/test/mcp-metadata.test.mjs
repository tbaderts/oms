import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { extractMetadata } from './mcp-metadata.mjs';
import { SKIP_ROOT_DIRS } from '../okf-check.mjs';

const bundle = fileURLToPath(new URL('../../../oms-knowledge-base/', import.meta.url));
const baseline = JSON.parse(readFileSync(new URL('./baseline-metadata.json', import.meta.url), 'utf8'));
const read = (rel) => readFileSync(join(bundle, rel), 'utf8');

const STATUS_MAP = {
  'active': 'stable',
  'complete': 'stable',
  'implementation complete': 'stable',
  'draft': 'draft',
  'draft for discussion': 'draft',
};

function frontMatter(content) {
  const m = content.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  return m ? yaml.load(m[1], { schema: yaml.JSON_SCHEMA }) : null;
}

function concepts(dir = bundle) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' || (relative(bundle, dir) === '' && SKIP_ROOT_DIRS.has(e.name)) ? [] : concepts(p);
    if (!e.name.endsWith('.md') || e.name === 'index.md' || e.name === 'log.md') return [];
    return [relative(bundle, p).split(sep).join('/')];
  });
}

test('MCP metadata unchanged: extractMetadata returns the baseline version and status', () => {
  for (const [rel, expected] of Object.entries(baseline)) {
    const { version, status } = extractMetadata(read(rel));
    assert.deepEqual({ version, status }, expected, rel);
  }
});

// Concepts created by the OKF conversion itself; AC-8 only covers documents that existed before.
const CREATED_BY_CONVERSION = new Set(['okf-conventions.md']);

test('status mapping: front matter status follows the bold header, draft when absent', () => {
  for (const rel of concepts().filter((c) => !CREATED_BY_CONVERSION.has(c))) {
    const fm = frontMatter(read(rel));
    assert.ok(fm, `${rel}: no front matter`);
    const header = baseline[rel]?.status?.toLowerCase();
    const expected = header === undefined ? 'draft' : STATUS_MAP[header];
    assert.ok(expected, `${rel}: unmapped header status "${header}"`);
    assert.equal(fm.status, expected, rel);
  }
});
