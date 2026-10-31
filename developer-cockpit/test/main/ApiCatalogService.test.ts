import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { ApiCatalogService } from '../../src/main/services/ApiCatalogService';
import { REPO_ROOT } from '../fixtures/workspace';

const OPENAPI = ['oms-contracts/src/main/openapi'];
const ALL_TYPES = [
  'OrderCreateCmd',
  'OrderAcceptCmd',
  'ExecutionCreateCmd',
  'OrderRejectCmd',
  'OrderCancelCmd',
  'OrderCancelRequestCmd',
  'OrderCancelRejectCmd',
];

describe('ApiCatalogService', () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

  /** A workspace holding a copy of the repository's contracts. */
  function copyOfContracts(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-catalog-'));
    dirs.push(root);
    fs.cpSync(path.join(REPO_ROOT, OPENAPI[0]), path.join(root, OPENAPI[0]), { recursive: true });
    return root;
  }

  it("lists the command types of the repository's Command mapping", () => {
    const catalog = new ApiCatalogService(REPO_ROOT, OPENAPI).load();
    expect(catalog.error).toBeUndefined();
    expect(catalog.commandTypes).toEqual(ALL_TYPES);
  });

  it('requires a non-empty sessionId on Order (SPEC-0034)', () => {
    const { schemas } = new ApiCatalogService(REPO_ROOT, OPENAPI).load();
    const order = schemas.OrderCreateCmd.properties!.order;
    expect(order.required).toContain('sessionId');
    expect(order.properties!.sessionId.minLength).toBe(1);
    const spec = yaml.load(fs.readFileSync(path.join(REPO_ROOT, OPENAPI[0], 'oms-cmd-api.yml'), 'utf8')) as { info: { version: string } };
    expect(spec.info.version).toBe('2.0.0');
  });

  it('bundles allOf and refs into self-contained schemas', () => {
    const { schemas } = new ApiCatalogService(REPO_ROOT, OPENAPI).load();
    const create = schemas.OrderCreateCmd;
    expect(create.type).toBe('object');
    expect(create.required).toEqual(expect.arrayContaining(['type', 'order']));
    const order = create.properties!.order;
    expect(order.required).toEqual(expect.arrayContaining(['clOrdId', 'account', 'ordType', 'side', 'symbol', 'orderQty']));
    // `side: allOf: [$ref: 'schema.yml#/…/Side']` collapses to the enum itself.
    expect(order.properties!.side.enum).toEqual(expect.arrayContaining(['BUY', 'SELL']));
    expect(schemas.ExecutionCreateCmd.properties!.execution.required).toEqual(['execId', 'orderId']);
    expect(schemas.OrderRejectCmd.properties!.text.maxLength).toBe(255);
    const keys = new Set<string>();
    JSON.stringify(schemas, (k, v) => (keys.add(k), v));
    expect([...keys].filter((k) => ['$ref', 'allOf', 'discriminator'].includes(k) || k.startsWith('x-'))).toEqual([]);
    expect(schemas['enum:State'].enum).toEqual(expect.arrayContaining(['NEW', 'LIVE', 'FILLED']));
    expect(schemas['enum:CancelState'].enum).toBeDefined();
    expect(schemas['enum:Side'].enum).toBeDefined();
    expect(schemas['enum:OrdType'].enum).toBeDefined();
  });

  it('follows the mapping on disk', () => {
    const root = copyOfContracts();
    const file = path.join(root, OPENAPI[0], 'oms-cmd-api.yml');
    const service = new ApiCatalogService(root, OPENAPI);
    expect(service.load().commandTypes).toEqual(ALL_TYPES);

    const original = fs.readFileSync(file, 'utf-8');
    fs.writeFileSync(
      file,
      original
        .replace("          OrderCancelRejectCmd: '#/components/schemas/OrderCancelRejectCmd'\n", '')
        .replace(
          "          OrderAcceptCmd: '#/components/schemas/OrderAcceptCmd'\n",
          "          OrderAcceptCmd: '#/components/schemas/OrderAcceptCmd'\n          OrderReplaceCmd: '#/components/schemas/OrderAcceptCmd'\n",
        )
        .replace(/\r\n/g, '\n'),
    );
    const next = service.load();
    expect(next.commandTypes).toContain('OrderReplaceCmd');
    expect(next.commandTypes).not.toContain('OrderCancelRejectCmd');
    expect(next.schemas.OrderReplaceCmd.required).toContain('orderId');
  });

  it('reports a missing contract file instead of throwing', () => {
    const root = copyOfContracts();
    fs.rmSync(path.join(root, OPENAPI[0], 'oms-cmd-api.yml'));
    const catalog = new ApiCatalogService(root, OPENAPI).load();
    expect(catalog.commandTypes).toEqual([]);
    expect(catalog.error).toMatch(/oms-cmd-api\.yml not found in oms-contracts\/src\/main\/openapi/);
  });

  it('reports a contract that does not parse', () => {
    const root = copyOfContracts();
    fs.writeFileSync(path.join(root, OPENAPI[0], 'oms-cmd-api.yml'), 'components: [unclosed');
    const catalog = new ApiCatalogService(root, OPENAPI).load();
    expect(catalog.commandTypes).toEqual([]);
    expect(catalog.error).toMatch(/oms-cmd-api\.yml/);
  });
});
