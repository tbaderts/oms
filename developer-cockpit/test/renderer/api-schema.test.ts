import { describe, expect, it } from 'vitest';
import { buildBody, checkBody } from '../../src/renderer/lib/api-schema';
import type { JsonSchema } from '../../src/shared/apiExplorer';

const ITEM: JsonSchema = {
  type: 'object',
  required: ['kind', 'sku', 'quantity', 'size', 'shipping'],
  properties: {
    kind: { type: 'string' },
    sku: { type: 'string', minLength: 1 },
    quantity: { type: 'integer' },
    size: { type: 'string', enum: ['S', 'M', 'L'] },
    gift: { type: 'boolean' },
    note: { type: 'string', maxLength: 5 },
    shipping: { type: 'object', required: ['at', 'express'], properties: { at: { type: 'string', format: 'date-time' }, express: { type: 'boolean', default: true } } },
    tags: { type: 'array', items: { type: 'string' } },
  },
};
const KIND = { property: 'kind', value: 'AddItem' };

describe('buildBody', () => {
  it('fills every required property, with the discriminator first', () => {
    const body = buildBody(ITEM, KIND) as Record<string, any>;
    expect(Object.keys(body)[0]).toBe('kind');
    expect(body).toMatchObject({ kind: 'AddItem', sku: '<sku>', quantity: 0, size: 'S', shipping: { express: true } });
    expect(typeof body.shipping.at).toBe('string');
    expect(body).not.toHaveProperty('gift');
    expect(checkBody(JSON.stringify(body), ITEM, KIND)).toEqual({ findings: [] });
  });

  it('a non-object schema gives a plain sample', () => {
    expect(buildBody({ type: 'array', items: { type: 'string' } })).toEqual([]);
    expect(buildBody({ type: 'string', example: 'hello' }, KIND)).toBe('hello');
  });
});

describe('checkBody', () => {
  it('reports missing required, wrong type, enum and length with paths', () => {
    const r = checkBody('{"kind":"AddItem","sku":"","quantity":1.5,"size":"XL","note":"too long","shipping":{"express":"yes"},"tags":[1]}', ITEM, KIND);
    expect(r.findings).toEqual(
      expect.arrayContaining([
        { path: 'sku', message: 'shorter than 1 character' },
        { path: 'quantity', message: 'expected integer, got number' },
        { path: 'size', message: '"XL" is not one of S, M, L' },
        { path: 'note', message: 'longer than 5 characters' },
        { path: 'shipping.at', message: 'required property is missing' },
        { path: 'shipping.express', message: 'expected boolean, got string' },
        { path: 'tags[0]', message: 'expected string, got number' },
      ]),
    );
  });

  it('flags a body that names another variant', () => {
    expect(checkBody('{"kind":"Checkout"}', ITEM, KIND).findings[0]).toEqual({ path: 'kind', message: 'expected "AddItem"' });
  });

  it('reports a body that is not an object, and JSON parse errors with line and column', () => {
    expect(checkBody('[]', ITEM).findings).toEqual([{ path: '(body)', message: 'expected object, got array' }]);
    expect(checkBody('{\n  "sku": "a",\n  oops\n}', ITEM).parseError).toMatch(/^Invalid JSON at line 3, column 3: /);
  });
});
