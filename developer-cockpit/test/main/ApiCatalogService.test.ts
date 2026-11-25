import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ApiCatalogService } from '../../src/main/services/ApiCatalogService';

/** A small two-file API: commands with a discriminated body, a search with query parameters. */
const SHOP_API = `
openapi: 3.0.3
info: { title: Shop API, version: 1.2.0 }
paths:
  /commands:
    post:
      operationId: execute
      summary: Run a command
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/Command' }
  /baskets/{basketId}:
    parameters:
      - { name: basketId, in: path, required: true, schema: { type: string } }
    get:
      operationId: getBasket
      parameters:
        - $ref: '#/components/parameters/Verbose'
    delete:
      summary: Drop a basket
  /search:
    get:
      operationId: search
      parameters:
        - { name: q, in: query, schema: { type: string } }
        - { name: page, in: query, required: true, schema: { type: integer, default: 0 } }
        - { name: X-Trace, in: header, schema: { type: string } }
components:
  parameters:
    Verbose: { name: verbose, in: query, schema: { type: boolean } }
  schemas:
    Command:
      type: object
      required: [kind]
      properties:
        kind: { type: string }
      discriminator:
        propertyName: kind
        mapping:
          AddItem: '#/components/schemas/AddItem'
          Checkout: '#/components/schemas/Checkout'
    AddItem:
      allOf:
        - $ref: '#/components/schemas/Command'
        - type: object
          required: [sku, quantity]
          properties:
            sku: { type: string, minLength: 1 }
            quantity: { type: integer }
            size: { $ref: 'common.yml#/components/schemas/Size' }
    Checkout:
      allOf:
        - $ref: '#/components/schemas/Command'
        - type: object
          properties:
            basketId: { type: string }
`;

const COMMON = `
components:
  schemas:
    Size: { type: string, enum: [S, M, L] }
`;

const ONE_OF_API = `
openapi: 3.0.3
info: { title: Pets, version: 1.0.0 }
paths:
  /pets:
    post:
      requestBody:
        content:
          application/json:
            schema:
              oneOf:
                - $ref: '#/components/schemas/Cat'
                - $ref: '#/components/schemas/Dog'
components:
  schemas:
    Cat: { type: object, properties: { lives: { type: integer } } }
    Dog: { type: object, properties: { good: { type: boolean } } }
`;

describe('ApiCatalogService', () => {
  let root: string;
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const setup = (files: Record<string, string>) => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-api-'));
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), text);
    }
  };

  it('lists the operations of each configured API', () => {
    setup({ 'api/shop.yml': SHOP_API, 'api/common.yml': COMMON });
    const { apis } = new ApiCatalogService(root, [{ name: 'Shop', spec: 'api/shop.yml', baseUrl: 'http://localhost:8000/v1' }]).load();

    expect(apis).toHaveLength(1);
    expect(apis[0]).toMatchObject({ name: 'Shop', title: 'Shop API', baseUrl: 'http://localhost:8000/v1', spec: 'api/shop.yml' });
    expect(apis[0].error).toBeUndefined();
    expect(apis[0].operations.map((o) => [o.id, o.method, o.path])).toEqual([
      ['execute', 'POST', '/commands'],
      ['getBasket', 'GET', '/baskets/{basketId}'],
      ['DELETE /baskets/{basketId}', 'DELETE', '/baskets/{basketId}'],
      ['search', 'GET', '/search'],
    ]);
  });

  it('merges path-level and referenced parameters', () => {
    setup({ 'api/shop.yml': SHOP_API, 'api/common.yml': COMMON });
    const ops = new ApiCatalogService(root, [{ name: 'Shop', spec: 'api/shop.yml', baseUrl: 'http://localhost:8000' }]).load().apis[0].operations;
    const byId = Object.fromEntries(ops.map((o) => [o.id, o]));

    expect(byId.getBasket.params).toEqual([
      { name: 'basketId', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'verbose', in: 'query', required: false, schema: { type: 'boolean' } },
    ]);
    expect(byId.search.params.map((p) => [p.name, p.in, p.required])).toEqual([
      ['q', 'query', false],
      ['page', 'query', true],
      ['X-Trace', 'header', false],
    ]);
    expect(byId.search.requestSchema).toBeUndefined();
  });

  it('resolves a discriminated body into one variant per mapping entry, following refs into sibling files', () => {
    setup({ 'api/shop.yml': SHOP_API, 'api/common.yml': COMMON });
    const execute = new ApiCatalogService(root, [{ name: 'Shop', spec: 'api/shop.yml', baseUrl: 'http://localhost:8000' }]).load().apis[0].operations[0];

    expect(execute.variants.map((v) => [v.name, v.discriminator])).toEqual([
      ['AddItem', { property: 'kind', value: 'AddItem' }],
      ['Checkout', { property: 'kind', value: 'Checkout' }],
    ]);
    const add = execute.variants[0].schema;
    expect(add.required).toEqual(['kind', 'sku', 'quantity']);
    expect(add.properties?.size).toEqual({ type: 'string', enum: ['S', 'M', 'L'] });
    expect(add.properties?.sku).toEqual({ type: 'string', minLength: 1 });
    expect(execute.requestSchema?.properties?.kind).toEqual({ type: 'string' });
  });

  it('a oneOf body becomes variants named after their schemas', () => {
    setup({ 'pets.yml': ONE_OF_API });
    const op = new ApiCatalogService(root, [{ name: 'Pets', spec: 'pets.yml', baseUrl: 'http://localhost:9000' }]).load().apis[0].operations[0];
    expect(op.id).toBe('POST /pets');
    expect(op.variants.map((v) => v.name)).toEqual(['Cat', 'Dog']);
    expect(op.variants[1].schema).toEqual({ type: 'object', properties: { good: { type: 'boolean' } } });
  });

  it('reports a missing or broken spec on that API only', () => {
    setup({ 'pets.yml': ONE_OF_API, 'broken.yml': 'paths: [unclosed', 'refs.yml': SHOP_API });
    const { apis } = new ApiCatalogService(root, [
      { name: 'Missing', spec: 'nope.yml', baseUrl: 'http://localhost:1' },
      { name: 'Broken', spec: 'broken.yml', baseUrl: 'http://localhost:2' },
      { name: 'Dangling', spec: 'refs.yml', baseUrl: 'http://localhost:3' },
      { name: 'Pets', spec: 'pets.yml', baseUrl: 'http://localhost:4' },
    ]).load();
    expect(apis[0].error).toMatch(/nope\.yml not found/);
    expect(apis[1].error).toMatch(/^broken\.yml: /);
    expect(apis[2].error).toMatch(/common\.yml not found/);
    expect(apis[2].operations).toEqual([]);
    expect(apis[3].operations).toHaveLength(1);
  });

  it('a $ref may not leave the spec folder', () => {
    setup({ 'api/escape.yml': SHOP_API.replace("common.yml#/components", "../../outside.yml#/components") });
    const { apis } = new ApiCatalogService(root, [{ name: 'Escape', spec: 'api/escape.yml', baseUrl: 'http://localhost:1' }]).load();
    expect(apis[0].error).toMatch(/may not leave the spec folder/);
  });
});

describe('ApiCatalogService $ref resolution (SPEC-0076 review)', () => {
  it('resolves a file ref relative to the file that contains it, and refuses one outside the folder', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-api-'));
    try {
      fs.mkdirSync(path.join(root, 'api', 'schemas'), { recursive: true });
      fs.writeFileSync(path.join(root, 'api', 'pets.yml'), `
openapi: 3.0.3
info: { title: Pets, version: 1.0.0 }
paths:
  /pets:
    post:
      requestBody: { content: { application/json: { schema: { $ref: 'schemas/pet.yml#/Pet' } } } }
`);
      fs.writeFileSync(path.join(root, 'api', 'schemas', 'pet.yml'), "Pet: { type: object, properties: { tag: { $ref: 'tag.yml#/Tag' } } }\n");
      fs.writeFileSync(path.join(root, 'api', 'schemas', 'tag.yml'), 'Tag: { type: string, enum: [a, b] }\n');
      const op = new ApiCatalogService(root, [{ name: 'Pets', spec: 'api/pets.yml', baseUrl: 'http://localhost:1' }]).load().apis[0].operations[0];
      expect(op.requestSchema).toEqual({ type: 'object', properties: { tag: { type: 'string', enum: ['a', 'b'] } } });

      const other = process.platform === 'win32' ? 'Z:/elsewhere/x.yml' : '/etc/elsewhere/x.yml';
      fs.writeFileSync(path.join(root, 'api', 'abs.yml'), `
openapi: 3.0.3
info: { title: Abs, version: 1.0.0 }
paths:
  /x:
    post:
      requestBody: { content: { application/json: { schema: { $ref: '${other}#/X' } } } }
`);
      const abs = new ApiCatalogService(root, [{ name: 'Abs', spec: 'api/abs.yml', baseUrl: 'http://localhost:1' }]).load().apis[0];
      expect(abs.error).toMatch(/may not leave the spec folder/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
