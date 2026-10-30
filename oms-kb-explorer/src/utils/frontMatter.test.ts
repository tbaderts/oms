import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripFrontMatter } from './frontMatter.ts';

test('strips a leading front matter block', () => {
  const doc = '---\ntype: Specification\ntitle: Order Lifecycle\ntags: [a, b]\n---\n# Order Lifecycle\n\nBody.\n';
  const out = stripFrontMatter(doc);
  assert.equal(out, '# Order Lifecycle\n\nBody.\n');
  assert.doesNotMatch(out, /type:|title:|tags:/);
});

test('drops blank lines between the block and the body', () => {
  assert.equal(stripFrontMatter('---\ntype: X\n---\n\n\n# Title\n'), '# Title\n');
});

test('keeps thematic breaks in the body', () => {
  const doc = '# Title\n\n---\n\nSection after a break.\n\n---\n';
  assert.equal(stripFrontMatter(doc), doc);
});

test('passes through content without front matter', () => {
  assert.equal(stripFrontMatter('# Plain\n\ntext'), '# Plain\n\ntext');
  assert.equal(stripFrontMatter(''), '');
});

test('keeps content whose opening --- is never closed', () => {
  const doc = '---\nnot closed\n# Title\n';
  assert.equal(stripFrontMatter(doc), doc);
});

test('handles CRLF line endings and a BOM', () => {
  assert.equal(stripFrontMatter('\uFEFF---\r\ntype: X\r\n---\r\n# Title\r\n'), '# Title\r\n');
});
