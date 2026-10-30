import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decorateHits, searchParams } from './search.ts';
import { DOCS } from './fixtures.ts';

test('decorates hits from the document list (unknown paths get their file name as title)', () => {
  const hits = decorateHits([
    { path: 'oms-knowledge-base/capabilities/order-capture.md', score: 1, snippet: 's' },
    { path: 'oms-knowledge-base/functional-requirements/FR-002-validate.md', score: 0.5, snippet: 't' },
    { path: 'elsewhere/unknown.md', score: 0.1, snippet: 'u' },
  ], DOCS);
  assert.deepEqual(hits.map((h) => [h.title, h.type, h.status, h.trustTier]), [
    ['Order Capture', 'Capability', 'draft', 'unverified'],
    ['Validate', 'Requirement', 'draft', 'human-reviewed'],
    ['unknown', undefined, undefined, undefined],
  ]);
  assert.equal(hits[0].snippet, 's', 'hit fields are kept');
});

test('search params carry type and tag filters', () => {
  assert.equal(searchParams('orders', 20, { type: 'Capability', tag: 'intake' }).toString(),
    'query=orders&topK=20&filterType=Capability&filterTag=intake');
  assert.equal(searchParams('orders', 20, {}).toString(), 'query=orders&topK=20');
  assert.equal(searchParams('orders', 20, { type: '', tag: '  ' }).toString(), 'query=orders&topK=20');
});
