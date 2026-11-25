import { describe, expect, it } from 'vitest';
import { buildUrl, isLocalHost } from '../../src/shared/apiExplorer';

describe('buildUrl', () => {
  it('fills path parameters (encoded) and appends non-empty query parameters', () => {
    expect(buildUrl('http://localhost:8000/v1/', '/baskets/{basketId}/items/{sku}', { basketId: 'B 1', sku: 'a/b' }, { verbose: 'true', page: '', q: 'lamp & desk' })).toBe(
      'http://localhost:8000/v1/baskets/B%201/items/a%2Fb?verbose=true&q=lamp+%26+desk',
    );
  });

  it('leaves an unfilled path parameter in place', () => {
    expect(buildUrl('http://h', '/baskets/{basketId}', { basketId: '  ' })).toBe('http://h/baskets/{basketId}');
  });
});

describe('isLocalHost', () => {
  it('treats localhost, 127.0.0.1 and ::1 as local', () => {
    expect(isLocalHost('http://localhost:8090')).toBe(true);
    expect(isLocalHost('http://127.0.0.1:8090/')).toBe(true);
    expect(isLocalHost('http://[::1]:8090')).toBe(true);
    expect(isLocalHost('https://shop-test.example:443')).toBe(false);
    expect(isLocalHost('http://localhost.example.com')).toBe(false);
    expect(isLocalHost('not a url')).toBe(false);
  });
});
