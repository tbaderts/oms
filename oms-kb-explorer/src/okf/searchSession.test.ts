import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_SESSION, searchSession, type SearchSession } from './searchSession.ts';
import type { HybridSearchHit } from '../types/index.ts';

const hit = (path: string): HybridSearchHit => ({ path, keywordScore: 1, semanticScore: 0, hybridScore: 1, snippet: '', matchType: 'keyword' });
const run = (...actions: Parameters<typeof searchSession>[1][]): SearchSession => actions.reduce(searchSession, INITIAL_SESSION);

test('submit starts a search for the query, filters and mode; succeeded shows the results', () => {
  const s = run({ type: 'submit', query: 'fills', filters: { type: 'Concept', tag: '' } });
  assert.equal(s.status, 'loading');
  assert.equal(s.request, 1);
  assert.deepEqual([s.query, s.filters, s.mode, s.showing], ['fills', { type: 'Concept', tag: '' }, 'keyword', 'results']);
  const done = searchSession(s, { type: 'succeeded', request: 1, results: [hit('a.md')] });
  assert.equal(done.status, 'done');
  assert.deepEqual(done.results.map((r) => r.path), ['a.md']);
});

test('an answer to an older request is ignored', () => {
  const s = run({ type: 'submit', query: 'a', filters: {} }, { type: 'submit', query: 'b', filters: {} });
  assert.equal(searchSession(s, { type: 'succeeded', request: 1, results: [hit('stale.md')] }), s);
  assert.equal(searchSession(s, { type: 'failed', request: 1, message: 'x' }), s);
});

test('modeChanged with a query reloads in the new mode, keeping query and filters (AC-5)', () => {
  const s = run({ type: 'submit', query: 'fills', filters: { tag: 'fix' } }, { type: 'succeeded', request: 1, results: [hit('a.md')] });
  const m = searchSession(s, { type: 'modeChanged', mode: 'semantic' });
  assert.deepEqual([m.mode, m.status, m.request, m.query, m.filters], ['semantic', 'loading', 2, 'fills', { tag: 'fix' }]);
});

test('modeChanged without a query only changes the mode', () => {
  const m = run({ type: 'modeChanged', mode: 'hybrid' });
  assert.deepEqual([m.mode, m.status, m.request], ['hybrid', 'idle', 0]);
});

test('openResult keeps results, backToResults restores them, submit replaces them (AC-6)', () => {
  const found = run({ type: 'submit', query: 'q', filters: {} }, { type: 'succeeded', request: 1, results: [hit('a.md'), hit('b.md')] });
  const opened = searchSession(found, { type: 'openResult' });
  assert.equal(opened.showing, 'document');
  assert.equal(opened.results.length, 2);
  const back = searchSession(opened, { type: 'backToResults' });
  assert.equal(back.showing, 'results');
  assert.equal(back.request, found.request); // no new request
  assert.deepEqual(back.results, found.results);
  const again = searchSession(back, { type: 'submit', query: 'other', filters: {} });
  assert.deepEqual(again.results, []);
  assert.equal(again.query, 'other');
});

test('failed records the message (AC-8)', () => {
  const s = run({ type: 'submit', query: 'q', filters: {} }, { type: 'failed', request: 1, message: 'HTTP 500' });
  assert.deepEqual([s.status, s.error, s.results], ['error', 'HTTP 500', []]);
});

test('clear empties query and results and shows the document (AC-7)', () => {
  const s = run({ type: 'submit', query: 'q', filters: { tag: 'x' } }, { type: 'succeeded', request: 1, results: [hit('a.md')] }, { type: 'clear' });
  assert.deepEqual([s.query, s.results, s.status, s.showing, s.error], ['', [], 'idle', 'document', null]);
  assert.equal(s.mode, 'keyword');
});

test('clear and an empty submit cancel a search still in flight (review finding 5)', () => {
  const pending = run({ type: 'submit', query: 'q', filters: {} });
  for (const cancel of [{ type: 'clear' } as const, { type: 'submit', query: '', filters: {} } as const]) {
    const cleared = searchSession(pending, cancel);
    assert.ok(cleared.request > pending.request, `${cancel.type} moves past the pending request`);
    const late = searchSession(cleared, { type: 'succeeded', request: pending.request, results: [hit('late.md')] });
    assert.equal(late, cleared, 'the late answer is ignored');
    assert.deepEqual([late.status, late.results, late.query], ['idle', [], '']);
  }
});

test('an empty query submit clears instead of searching', () => {
  const s = run({ type: 'submit', query: '   ', filters: {} });
  assert.deepEqual([s.status, s.query, s.showing], ['idle', '', 'document']); // no search started
});
