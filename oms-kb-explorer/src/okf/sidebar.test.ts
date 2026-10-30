import { test } from 'node:test';
import assert from 'node:assert/strict';
import { folderTree, typeGroups, matches, displayTitle, entryLabel, showTrustInTree, typesPresent, NO_FILTER, type FolderNode } from './sidebar.ts';
import { DOCS, doc } from './fixtures.ts';

const names = (docs: { name: string }[]) => docs.map((d) => d.name);
const allDocs = (node: FolderNode): string[] =>
  [...node.docs.map((d) => d.path), ...(node.index ? [node.index.path] : []), ...node.folders.flatMap(allDocs)];

test('folder tree nests, index.md is the folder entry, log.md at root, each concept once', () => {
  const root = folderTree(DOCS, NO_FILTER);
  assert.equal(root.index?.name, 'index.md');
  // documents are ordered by what the tree shows: their title (file name when there is none)
  assert.deepEqual(names(root.docs), ['okf-conventions.md', 'log.md']);
  const caps = root.folders.find((f) => f.name === 'capabilities')!;
  assert.deepEqual(caps.docs.map(displayTitle), ['Execution Processing', 'Order Capture', 'Quotes']);
  assert.deepEqual(root.folders.map((f) => f.name),
    ['capabilities', 'functional-requirements', 'non-functional-requirements', 'oms-concepts']);
  const concepts = root.folders.find((f) => f.name === 'oms-concepts')!;
  assert.equal(concepts.index?.path, 'oms-knowledge-base/oms-concepts/index.md');
  assert.ok(!names(concepts.docs).includes('index.md'));
  assert.deepEqual(concepts.folders.map((f) => f.name), ['sub']);
  assert.deepEqual(names(concepts.folders[0].docs), ['deep.md']);
  assert.equal(concepts.folders[0].path, 'oms-knowledge-base/oms-concepts/sub');
  const listed = allDocs(root);
  assert.equal(listed.length, DOCS.length);
  assert.equal(new Set(listed).size, DOCS.length);
});

test('type groups: order, untyped last, reserved excluded, requirements by id, capabilities by maturity', () => {
  const groups = typeGroups(DOCS, NO_FILTER);
  assert.deepEqual(groups.map((g) => g.type), ['Capability', 'Requirement', 'Specification', 'Diagram', 'Reference', 'Untyped']);
  const caps = groups[0];
  assert.deepEqual(caps.subgroups.map((s) => [s.label, names(s.docs)]),
    [['implemented', ['order-capture.md']], ['partial', ['execution-processing.md']], ['planned', ['quotes.md']]]);
  const reqs = groups[1];
  assert.deepEqual(reqs.subgroups.map((s) => [s.label, s.docs.map((d) => d.okf?.id)]),
    [['Functional', ['FR-002', 'FR-010']], ['Non-functional', ['NFR-001']]]);
  assert.deepEqual(names(groups[5].subgroups[0].docs), ['legacy-notes.md']);
  const all = groups.flatMap((g) => g.subgroups.flatMap((s) => names(s.docs)));
  assert.ok(!all.includes('index.md') && !all.includes('log.md'));
});

test('filters by status and trust and drops empty groups', () => {
  const stableOnly = typeGroups(DOCS, { statuses: ['stable'], trust: [] });
  assert.deepEqual(stableOnly.map((g) => g.type), ['Specification', 'Reference', 'Untyped'],
    'legacy "Active" counts as stable');
  const reviewed = typeGroups(DOCS, { statuses: [], trust: ['human-reviewed'] });
  assert.deepEqual(reviewed.map((g) => [g.type, g.subgroups.map((s) => s.label)]), [['Requirement', ['Functional']]]);
  assert.deepEqual(typeGroups(DOCS, { statuses: ['stable'], trust: ['human-reviewed'] }), []);

  const tree = folderTree(DOCS, { statuses: ['draft'], trust: ['human-reviewed'] });
  assert.deepEqual(tree.folders.map((f) => f.name), ['functional-requirements']);
  assert.deepEqual(names(tree.folders[0].docs), ['FR-002-validate.md']);
  assert.equal(tree.docs.length, 0, 'navigation files only shown without filters');
});

test('entry labels, trust shown only for reviewed documents, and the types present', () => {
  const fr = DOCS.find((d) => d.okf?.id === 'FR-002')!;
  assert.equal(entryLabel(fr), 'FR-002 Validate');
  assert.equal(entryLabel(DOCS[4]), 'Order Capture');
  assert.equal(showTrustInTree(fr), true, 'human-reviewed');
  assert.equal(showTrustInTree(DOCS[4]), false, 'unverified is the default and not repeated per row');
  assert.deepEqual(typesPresent(DOCS), ['Capability', 'Diagram', 'Reference', 'Requirement', 'Specification']);
});

test('matches and display titles', () => {
  const legacy = doc('x/legacy.md', null, { status: 'Complete' });
  assert.ok(matches(legacy, { statuses: ['stable'], trust: ['unverified'] }), 'documents without front matter are unverified');
  assert.ok(!matches(legacy, { statuses: ['draft'], trust: [] }));
  assert.equal(displayTitle(legacy), 'legacy.md');
  assert.equal(displayTitle(DOCS[4]), 'Order Capture');
});
