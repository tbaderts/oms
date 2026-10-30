import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentHeader } from './header.ts';
import { doc } from './fixtures.ts';

test('builds the header with keys and classified sources', () => {
  const h = documentHeader(doc('functional-requirements/FR-001-accept.md', {
    type: 'Requirement', title: 'Accept new orders', description: 'Creates orders.', status: 'draft',
    trustTier: 'unverified', version: '1.0', updated: '2026-10-01T00:00:00Z', tags: ['functional', 'order-capture'],
    id: 'FR-001', priority: 'must', implementation: 'implemented', capability: '/capabilities/order-capture.md',
    sources: ['repo:oms-core/src/main/java/Foo.java', '/oms-concepts/order-lifecycle.md', 'https://example.com', 'free text'],
  }));
  assert.ok(h);
  assert.equal(h.title, 'Accept new orders');
  assert.equal(h.type, 'Requirement');
  assert.equal(h.status, 'draft');
  assert.deepEqual(h.trust, { label: 'Unverified', tone: 'warning' });
  assert.equal(h.stale, false);
  assert.equal(h.version, '1.0');
  assert.equal(h.updated, '2026-10-01T00:00:00Z');
  assert.deepEqual(h.tags, ['functional', 'order-capture']);
  assert.equal(h.description, 'Creates orders.');
  assert.deepEqual(h.keys, [
    { label: 'Id', value: 'FR-001' },
    { label: 'Priority', value: 'must' },
    { label: 'Implementation', value: 'implemented' },
    { label: 'Capability', value: '/capabilities/order-capture.md', path: 'oms-knowledge-base/capabilities/order-capture.md' },
  ]);
  assert.deepEqual(h.sources, [
    { kind: 'repo', path: 'oms-core/src/main/java/Foo.java' },
    { kind: 'doc', path: 'oms-knowledge-base/oms-concepts/order-lifecycle.md' },
    { kind: 'url', href: 'https://example.com' },
    { kind: 'text', value: 'free text' },
  ]);
});

test('no header without front matter type', () => {
  assert.equal(documentHeader(doc('x/legacy.md', null)), null);
  assert.equal(documentHeader(doc('x/untyped.md', {})), null);
  assert.equal(documentHeader(undefined), null);
});

test('stale only when okf.stale, with the date', () => {
  const stale = documentHeader(doc('x/a.md', { type: 'Specification', title: 'A', stale: true, staleAfter: '2026-01-01T00:00:00Z' }));
  assert.equal(stale?.stale, true);
  assert.equal(stale?.staleAfter, '2026-01-01T00:00:00Z');
  const fresh = documentHeader(doc('x/b.md', { type: 'Specification', title: 'B', staleAfter: '2099-01-01T00:00:00Z' }));
  assert.equal(fresh?.stale, false);
  assert.deepEqual(fresh?.keys, []);
  const cap = documentHeader(doc('capabilities/q.md', { type: 'Capability', title: 'Q', maturity: 'planned' }));
  assert.deepEqual(cap?.keys, [{ label: 'Maturity', value: 'planned' }]);
});
