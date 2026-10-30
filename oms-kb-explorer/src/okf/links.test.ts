import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDocLink, classifySource, slugify, docFromLocation, locationForDoc } from './links.ts';

test('deep links: ?doc=<path>#anchor round-trips', () => {
  const path = 'oms-knowledge-base/capabilities/order capture.md';
  const url = locationForDoc(path, 'summary');
  assert.equal(url, '?doc=oms-knowledge-base%2Fcapabilities%2Forder+capture.md#summary');
  assert.deepEqual(docFromLocation('?doc=oms-knowledge-base%2Fcapabilities%2Forder+capture.md', '#summary'), { path, anchor: 'summary' });
  assert.deepEqual(docFromLocation('', ''), { path: null, anchor: undefined });
  assert.equal(locationForDoc(path), '?doc=oms-knowledge-base%2Fcapabilities%2Forder+capture.md');
});

test('heading slugs match markdown anchors', () => {
  assert.equal(slugify('1. Introduction'), '1-introduction');
  assert.equal(slugify('Order State & Cancel State'), 'order-state--cancel-state');
  assert.equal(slugify('`OrderCreateCmd` (REST)'), 'ordercreatecmd-rest');
  assert.equal(slugify('Ä Übersicht'), 'ä-übersicht');
});

const FROM = 'oms-knowledge-base/capabilities/order-capture.md';

test('relative links resolve against the document folder', () => {
  assert.deepEqual(resolveDocLink(FROM, '../functional-requirements/FR-001-accept-new-orders.md'),
    { kind: 'doc', path: 'oms-knowledge-base/functional-requirements/FR-001-accept-new-orders.md' });
  assert.deepEqual(resolveDocLink(FROM, 'order-acceptance.md'),
    { kind: 'doc', path: 'oms-knowledge-base/capabilities/order-acceptance.md' });
  assert.deepEqual(resolveDocLink(FROM, './order-acceptance.md'),
    { kind: 'doc', path: 'oms-knowledge-base/capabilities/order-acceptance.md' });
});

test('root links resolve against the bundle root, anchors are kept', () => {
  assert.deepEqual(resolveDocLink(FROM, '/domain/order.md#persistence'),
    { kind: 'doc', path: 'oms-knowledge-base/domain/order.md', anchor: 'persistence' });
  assert.deepEqual(resolveDocLink(FROM, '../domain/order-state.md?x=1#states'),
    { kind: 'doc', path: 'oms-knowledge-base/domain/order-state.md', anchor: 'states' });
});

test('folder links resolve to the folder index', () => {
  assert.deepEqual(resolveDocLink(FROM, '../domain/'), { kind: 'doc', path: 'oms-knowledge-base/domain/index.md' });
  assert.deepEqual(resolveDocLink(FROM, '../domain'), { kind: 'doc', path: 'oms-knowledge-base/domain/index.md' });
});

test('anchors stay in the document, external links stay external', () => {
  assert.deepEqual(resolveDocLink(FROM, '#summary'), { kind: 'anchor', anchor: 'summary' });
  assert.deepEqual(resolveDocLink(FROM, 'https://example.com/x.md'), { kind: 'external', href: 'https://example.com/x.md' });
  assert.deepEqual(resolveDocLink(FROM, 'mailto:team@example.com'), { kind: 'external', href: 'mailto:team@example.com' });
});

test('links leaving the bundle are not in-app links', () => {
  assert.equal(resolveDocLink(FROM, '../../oms-core/README.md'), null);
  assert.equal(resolveDocLink(FROM, ''), null);
});

test('percent-encoded paths are decoded', () => {
  assert.deepEqual(resolveDocLink(FROM, '../oms-concepts/order%20lifecycle.md'),
    { kind: 'doc', path: 'oms-knowledge-base/oms-concepts/order lifecycle.md' });
});

test('only markdown documents and folders are in-app links', () => {
  // a dotted folder needs a trailing slash; other files (images, yml) are not documents
  assert.deepEqual(resolveDocLink(FROM, '../v1.2/'), { kind: 'doc', path: 'oms-knowledge-base/v1.2/index.md' });
  assert.equal(resolveDocLink(FROM, '../illustrations/diagram.png'), null);
  assert.equal(resolveDocLink(FROM, '../config.yml'), null);
  assert.deepEqual(resolveDocLink(FROM, 'notes.markdown'), { kind: 'doc', path: 'oms-knowledge-base/capabilities/notes.markdown' });
});

test('only http, https and mailto sources are links', () => {
  assert.deepEqual(classifySource(FROM, 'javascript:alert(1)'), { kind: 'text', value: 'javascript:alert(1)' });
  assert.deepEqual(classifySource(FROM, 'data:text/html,x'), { kind: 'text', value: 'data:text/html,x' });
  assert.deepEqual(classifySource(FROM, 'mailto:team@example.com'), { kind: 'url', href: 'mailto:team@example.com' });
  assert.deepEqual(classifySource(FROM, 'http://example.com'), { kind: 'url', href: 'http://example.com' });
});

test('sources are classified as bundle documents, repository paths, URLs or text', () => {
  assert.deepEqual(classifySource(FROM, '/capabilities/order-query.md'),
    { kind: 'doc', path: 'oms-knowledge-base/capabilities/order-query.md' });
  assert.deepEqual(classifySource(FROM, 'repo:oms-core/src/main/java/Foo.java'),
    { kind: 'repo', path: 'oms-core/src/main/java/Foo.java' });
  assert.deepEqual(classifySource(FROM, 'https://github.com/x'), { kind: 'url', href: 'https://github.com/x' });
  assert.deepEqual(classifySource(FROM, 'BigQuery dataset sales.orders'), { kind: 'text', value: 'BigQuery dataset sales.orders' });
});
