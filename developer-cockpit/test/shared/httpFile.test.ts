import { describe, expect, it } from 'vitest';
import { effectiveNames, formatTemplateBlock, parseHttpFile, templateName } from '../../src/shared/httpFile';

const FILE = [
  '@baseUrl = http://localhost:8000',
  '@owner=ann',
  '',
  '# @name Create basket',
  'POST {{baseUrl}}/baskets HTTP/1.1',
  'content-type: application/json',
  '',
  '{',
  '  "owner": "{{owner}}"',
  '}',
  '',
  '###',
  'GET http://localhost:8000/search?q=lamp HTTP/1.1',
  '',
  '###',
  '# Checkout a basket',
  'POST http://localhost:8000/baskets/{{basketId}}/checkout',
  'Content-Type: application/json',
  '',
  '{"express":true}',
  '###',
  '// @name drop',
  'DELETE http://x/baskets/1',
  '###',
  'http://localhost:8000/health',
  '@owner = bo',
].join('\r\n');

describe('parseHttpFile', () => {
  it('parses requests, names, comments and file variables', () => {
    const f = parseHttpFile(FILE);
    expect(f.variables).toEqual({ baseUrl: 'http://localhost:8000', owner: 'bo' });
    expect(f.requests.map((r) => [r.method, r.name, r.comment, r.line])).toEqual([
      ['POST', 'Create basket', null, 5],
      ['GET', null, null, 13],
      ['POST', null, 'Checkout a basket', 17],
      ['DELETE', 'drop', null, 23],
      ['GET', null, null, 25],
    ]);
    expect(f.requests[0].url).toBe('{{baseUrl}}/baskets');
    expect(f.requests[0].body).toBe('{\n  "owner": "{{owner}}"\n}');
    expect(f.requests[1].body).toBeNull();
    expect(f.requests[2].body).toBe('{"express":true}');
  });

  it('lists a request by its name, its comment, or its method and URL', () => {
    const f = parseHttpFile(FILE);
    expect(effectiveNames(f)).toEqual(['Create basket', 'GET http://localhost:8000/search?q=lamp', 'Checkout a basket', 'drop', 'GET http://localhost:8000/health']);
    expect(templateName({ ...f.requests[2], comment: null })).toBe('POST http://localhost:8000/baskets/{{basketId}}/checkout');
  });

  it('parses an empty file', () => {
    expect(parseHttpFile('')).toEqual({ variables: {}, requests: [] });
  });
});

describe('formatTemplateBlock', () => {
  it('round-trips through parseHttpFile', () => {
    const body = '{\n  "owner": "{{$guid}}"\n}';
    const block = formatTemplateBlock('My basket', 'post', '{{baseUrl}}/baskets', body);
    expect(block.startsWith('\n###\n# @name My basket\nPOST {{baseUrl}}/baskets HTTP/1.1\ncontent-type: application/json\n')).toBe(true);
    const [r] = parseHttpFile(`@baseUrl = http://h${block}`).requests;
    expect(r).toMatchObject({ name: 'My basket', method: 'POST', url: '{{baseUrl}}/baskets', body });
  });

  it('writes no content type for a request without a body', () => {
    const block = formatTemplateBlock('List', 'GET', 'http://h/baskets', '');
    expect(block).toBe('\n###\n# @name List\nGET http://h/baskets HTTP/1.1\n');
    expect(parseHttpFile(block).requests[0]).toMatchObject({ method: 'GET', body: null });
  });
});
