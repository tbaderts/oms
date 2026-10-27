import { describe, expect, it } from 'vitest';
import { ApiCatalogService } from '../../src/main/services/ApiCatalogService';
import { buildTemplate, checkBody, orderIdOf } from '../../src/renderer/lib/api-schema';
import { REPO_ROOT } from '../fixtures/workspace';

const catalog = new ApiCatalogService(REPO_ROOT, ['oms-contracts/src/main/openapi']).load();
const schema = (type: string) => catalog.schemas[type];

/** Every required path of a schema, e.g. ['type', 'order', 'order.clOrdId', …]. */
function requiredPaths(s: (typeof catalog.schemas)[string], prefix = ''): string[] {
  return (s.required ?? []).flatMap((name) => {
    const p = prefix ? `${prefix}.${name}` : name;
    const child = s.properties?.[name];
    return child?.type === 'object' || child?.properties ? [p, ...requiredPaths(child, p)] : [p];
  });
}

const get = (obj: unknown, p: string) => p.split('.').reduce<any>((o, k) => o?.[k], obj);

describe('buildTemplate', () => {
  it('template for every command type has the type and all required properties and passes the check', () => {
    expect(catalog.commandTypes).toHaveLength(7);
    for (const type of catalog.commandTypes) {
      const template = buildTemplate(type, schema(type));
      expect(template.type, type).toBe(type);
      for (const p of requiredPaths(schema(type))) expect(get(template, p), `${type} ${p}`).toBeDefined();
      expect(checkBody(JSON.stringify(template, null, 2), type, schema(type)), type).toEqual({ findings: [] });
    }
  });

  it('resolves allOf and schema.yml refs (Order.side is the Side enum)', () => {
    const t = buildTemplate('OrderCreateCmd', schema('OrderCreateCmd')) as any;
    expect(schema('enum:Side').enum).toContain(t.order.side);
    expect(schema('enum:OrdType').enum).toContain(t.order.ordType);
    expect(t.order.clOrdId).toBe('<clOrdId>');
    expect(typeof t.order.orderQty).toBe('number');
    expect(t.version).toBe('1.0.0');
  });

  it('nested required properties are filled (execution.execId)', () => {
    const t = buildTemplate('ExecutionCreateCmd', schema('ExecutionCreateCmd')) as any;
    expect(t.execution.execId).toBe('<execId>');
    expect(t.execution.orderId).toBe('<orderId>');
  });

  it('applies a preset over the template', () => {
    const t = buildTemplate('OrderAcceptCmd', schema('OrderAcceptCmd'), { orderId: 'O-1' }) as any;
    expect(t.orderId).toBe('O-1');
    const e = buildTemplate('ExecutionCreateCmd', schema('ExecutionCreateCmd'), { orderId: 'O-1' }) as any;
    expect(e.execution.orderId).toBe('O-1');
  });
});

describe('checkBody', () => {
  it('reports missing required, wrong type, enum and length with paths', () => {
    const body = {
      type: 'OrderCreateCmd',
      order: { clOrdId: '', account: 'A', ordType: 'LIMIT', side: 'SIDEWAYS', symbol: 'AAPL', orderQty: '100' },
    };
    const { findings, parseError } = checkBody(JSON.stringify(body), 'OrderCreateCmd', schema('OrderCreateCmd'));
    expect(parseError).toBeUndefined();
    expect(findings).toEqual(
      expect.arrayContaining([
        { path: 'order.side', message: expect.stringMatching(/not one of BUY, SELL/) },
        { path: 'order.orderQty', message: 'expected number, got string' },
        { path: 'order.clOrdId', message: 'shorter than 1 character' },
      ]),
    );
    const missing = checkBody('{"type":"OrderAcceptCmd"}', 'OrderAcceptCmd', schema('OrderAcceptCmd')).findings;
    expect(missing).toEqual([{ path: 'orderId', message: 'required property is missing' }]);
    const long = checkBody(
      JSON.stringify({ type: 'OrderRejectCmd', orderId: 'X', text: 'x'.repeat(256) }),
      'OrderRejectCmd',
      schema('OrderRejectCmd'),
    ).findings;
    expect(long).toEqual([{ path: 'text', message: 'longer than 255 characters' }]);
  });

  it('reports null for a property that is not nullable', () => {
    const { findings } = checkBody('{"type":"OrderAcceptCmd","orderId":null}', 'OrderAcceptCmd', schema('OrderAcceptCmd'));
    expect(findings).toEqual([{ path: 'orderId', message: 'expected string, got null' }]);
    const nested = checkBody(
      JSON.stringify({ type: 'ExecutionCreateCmd', execution: { execId: 'E', orderId: 'O', lastQty: null } }),
      'ExecutionCreateCmd',
      schema('ExecutionCreateCmd'),
    ).findings;
    expect(nested).toEqual([{ path: 'execution.lastQty', message: 'expected number, got null' }]);
  });

  it('flags a type that differs from the selected command', () => {
    const { findings } = checkBody('{"type":"OrderCancelCmd","orderId":"X"}', 'OrderAcceptCmd', schema('OrderAcceptCmd'));
    expect(findings).toEqual([{ path: 'type', message: 'expected "OrderAcceptCmd"' }]);
  });

  it('reports a body that is not an object', () => {
    expect(checkBody('[1]', 'OrderAcceptCmd', schema('OrderAcceptCmd')).findings).toEqual([
      { path: '(body)', message: 'expected object, got array' },
    ]);
  });

  it('reports JSON parse errors with line and column', () => {
    const r = checkBody('{\n  "type": "OrderAcceptCmd",\n  "orderId": \n}', 'OrderAcceptCmd', schema('OrderAcceptCmd'));
    expect(r.parseError).toMatch(/line 4, column 1/);
    expect(r.findings).toEqual([]);
  });
});

describe('orderIdOf', () => {
  it('orderIdOf for create, execution and order commands', () => {
    expect(orderIdOf({ type: 'OrderCreateCmd', order: {} }, { status: 'OK', id: 'O-9' })).toBe('O-9');
    expect(orderIdOf({ type: 'OrderCreateCmd', order: {} }, { status: 'FAILED', id: '' })).toBeNull();
    expect(orderIdOf({ type: 'ExecutionCreateCmd', execution: { orderId: 'O-2' } }, {})).toBe('O-2');
    expect(orderIdOf({ type: 'OrderAcceptCmd', orderId: 'O-3' }, null)).toBe('O-3');
    expect(orderIdOf({ type: 'OrderAcceptCmd' }, null)).toBeNull();
    expect(orderIdOf('not an object', null)).toBeNull();
  });
});
