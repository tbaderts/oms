// tokens.test.ts - The explorer uses oms-ui's design tokens unchanged (SPEC-0066 AC-1). It keeps its
// own copy (so it builds on its own) and this test fails on any drift in either direction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OMS_UI_TOKENS = join(here, '../../../oms-ui/frontend/src/theme/_tokens.scss');
const EXPLORER_TOKENS = join(here, 'tokens.css');

/** Every `--oms-name: value;` in a file, with whitespace in values normalised. */
export function parseTokens(source: string): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const [, name, value] of source.matchAll(/--oms-([\w-]+)\s*:\s*([^;]+);/g)) {
    tokens.set(name, value.trim().replace(/\s+/g, ' '));
  }
  return tokens;
}

test('explorer tokens equal oms-ui tokens', () => {
  const reference = parseTokens(readFileSync(OMS_UI_TOKENS, 'utf8'));
  const explorer = parseTokens(readFileSync(EXPLORER_TOKENS, 'utf8'));
  assert.ok(reference.size > 50, `expected oms-ui's token set at ${OMS_UI_TOKENS}`);

  const missing = [...reference.keys()].filter((k) => !explorer.has(k));
  const extra = [...explorer.keys()].filter((k) => !reference.has(k));
  const changed = [...reference].filter(([k, v]) => explorer.has(k) && explorer.get(k) !== v).map(([k, v]) => `${k}: oms-ui "${v}", explorer "${explorer.get(k)}"`);
  assert.deepEqual(
    { missing, extra, changed },
    { missing: [], extra: [], changed: [] },
    'oms-kb-explorer/src/theme/tokens.css must match oms-ui/frontend/src/theme/_tokens.scss: copy its :root block',
  );
});
