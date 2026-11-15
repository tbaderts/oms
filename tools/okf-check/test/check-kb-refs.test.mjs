// check-kb-refs (SPEC-0061 AC-10): dangling knowledge base references outside the bundle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { findDanglingRefs } from '../check-kb-refs.mjs';

/** A throw-away repository with the given files; returns findings for all of them. */
function scan(files) {
  const root = mkdtempSync(join(tmpdir(), 'kbrefs-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), content);
    }
    return findDanglingRefs(root, Object.keys(files));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const KB = {
  'oms-knowledge-base/index.md': '# KB\n',
  'oms-knowledge-base/domain/concepts/order-lifecycle.md': '# Lifecycle\n',
};

test('existing references pass, in every form', () => {
  const findings = scan({
    ...KB,
    'README.md': 'See [lifecycle](oms-knowledge-base/domain/concepts/order-lifecycle.md#states).\n',
    'oms-core/src/main/java/A.java': ' * @see <a href="file:///oms-knowledge-base/domain/concepts/order-lifecycle.md">x</a>\n',
    'mission-control/README.md': 'Spec: ../oms-knowledge-base/domain/concepts/order-lifecycle.md.\n',
    'docs/folder.md': 'The folder `oms-knowledge-base/domain/` holds it.\n',
  });
  assert.deepEqual(findings, []);
});

test('a dangling reference fails with file and line', () => {
  const findings = scan({ ...KB, 'CLAUDE.md': 'intro\n- `oms-knowledge-base/domain/concepts/gone.md`\n' });
  assert.deepEqual(findings, [{ file: 'CLAUDE.md', line: 2, message: 'oms-knowledge-base/domain/concepts/gone.md does not exist' }]);
});

test('a retired folder name fails even without the oms-knowledge-base prefix', () => {
  const findings = scan({ ...KB, '.github/copilot-instructions.md': '| x | `oms-framework/domain-model_spec.md` |\n' });
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /retired knowledge base folder oms-framework\//);
});

test('test sources may name fixture paths, but not retired folders', () => {
  const fixture = scan({ ...KB, 'developer-cockpit/test/main/A.test.ts': "ws.write({ 'oms-knowledge-base/capabilities/functional-requirements/FR-001-x.md': md })\n" });
  assert.deepEqual(fixture, []);
  const legacy = scan({ ...KB, 'oms-core/src/test/java/XTest.java': '"oms-knowledge-base/oms-concepts/x.md"\n' });
  assert.equal(legacy.length, 1);
  assert.match(legacy[0].message, /retired knowledge base folder oms-concepts\//);
});

test('aliases front matter may name former paths', () => {
  const findings = scan({ ...KB, 'oms-knowledge-base/domain/concepts/x.md': '---\naliases: [oms-concepts/x]\ntype: Specification\n---\n# X\n' });
  assert.deepEqual(findings, []);
});

test('a retired file name is found on its own; a current or longer name is not', () => {
  const register = 'oms-knowledge-base/semantic-layer/kb-review-2026-11.md';
  const findings = scan({
    ...KB,
    [register]: [
      '| Old path | Disposition | New path | Notes |',
      '|---|---|---|---|',
      '| `oms-framework/domain-model_spec.md` | update | `domain/model/domain-model.md` | x |',
      '| `oms-concepts/order-lifecycle.md` | keep | `domain/concepts/order-lifecycle.md` | x |',
      '| `oms-methodolgy/agent.md` | archive | `archive/agent-profile-java-backend.md` | x |',
    ].join('\n') + '\n',
    'oms-knowledge-base/domain/concepts/order-lifecycle.md': '# Lifecycle\n',
    '.github/agents/a.md': 'Consult `domain-model_spec.md` and `order-lifecycle.md`; this is oms.agent.md.\n',
  });
  assert.deepEqual(findings.map((f) => f.message), ['retired knowledge base file name domain-model_spec.md']);
});

test('references to moved oms-core/docs files fail', () => {
  const findings = scan({ ...KB, 'oms-core/README.md': 'See oms-core/docs/load-baseline.md.\n' });
  assert.deepEqual(findings.map((f) => f.message), ['oms-core/docs/load-baseline.md does not exist']);
});

test('history and tooling are excluded, non-text files are skipped', () => {
  const stale = 'oms-knowledge-base/oms-concepts/order-lifecycle.md';
  const findings = scan({
    ...KB,
    'specs/archive/SPEC-0001-x/design.md': stale,
    'specs/changes/SPEC-0061-x/design.md': stale,
    'openwiki/quickstart.md': stale,
    'oms-knowledge-base/archive/old.md': stale,
    'oms-knowledge-base/log.md': stale,
    'oms-knowledge-base/semantic-layer/kb-review-2026-11.md': stale,
    'diagram.png': stale,
  });
  assert.deepEqual(findings, []);
});
