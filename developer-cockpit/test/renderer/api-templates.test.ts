import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { ApiCatalogService } from '../../src/main/services/ApiCatalogService';
import { checkBody } from '../../src/renderer/lib/api-schema';
import {
  checkTemplateBody,
  classifyTemplates,
  inlineFileVariables,
  orderToTemplate,
  resolveVariables,
  templatize,
  type ResolveContext,
} from '../../src/renderer/lib/api-templates';
import { parseHttpFile } from '../../src/shared/httpFile';
import type { TemplateSource } from '../../src/shared/apiExplorer';
import { REPO_ROOT } from '../fixtures/workspace';

const catalog = new ApiCatalogService(REPO_ROOT, ['oms-contracts/src/main/openapi']).load();
const schema = (type: string) => catalog.schemas[type];

function ctx(over: Partial<ResolveContext> = {}): ResolveContext {
  let n = 0;
  return {
    variables: {},
    orderId: null,
    now: () => new Date('2026-10-27T05:44:00.000Z'),
    uuid: () => `uuid-${++n}`,
    random: () => 0.5,
    ...over,
  };
}

const source = (p: string, text: string): TemplateSource => ({ path: p, shared: true, file: parseHttpFile(text) });

describe('classifyTemplates', () => {
  it('classifies command blocks by type and reports unusable ones', () => {
    const text = [
      '@qty = 100',
      '# @name INTC buy',
      'POST {{baseUrl}}/api/command/execute',
      '',
      '{"type":"OrderCreateCmd","order":{"orderQty":{{qty}},"clOrdId":"{{$guid}}"}}',
      '###',
      '# Accept it',
      'POST http://h/api/command/execute',
      '',
      '{"type":"OrderAcceptCmd","orderId":"{{orderId}}"}',
      '###',
      'POST http://h/api/command/execute',
      '',
      '{"type":"OrderAcceptCmd","orderId":"x"}',
      '###',
      'GET http://h/api/query/search',
      '###',
      'POST http://h/api/command/execute',
      '',
      '{"type":"Bogus"}',
      '###',
      '# @name broken',
      'POST http://h/api/command/execute',
      '',
      '{"type": ',
      '###',
      '# @name empty',
      'POST http://h/api/command/execute',
    ].join('\n');
    const { byType, unusable } = classifyTemplates(
      [source('developer-cockpit/api-templates/a.http', text), { path: 'missing.http', shared: false, missing: true }],
      catalog.commandTypes,
    );
    expect(byType.OrderCreateCmd.map((t) => [t.name, t.source, t.line])).toEqual([['INTC buy', 'developer-cockpit/api-templates/a.http', 3]]);
    expect(byType.OrderCreateCmd[0].variables).toEqual({ qty: '100' });
    expect(byType.OrderAcceptCmd.map((t) => t.name)).toEqual(['Accept it', 'OrderAcceptCmd #2']);
    expect(unusable.map((u) => [u.name, u.reason])).toEqual([
      ['Bogus #1', 'unknown command type Bogus'],
      ['broken', expect.stringMatching(/^invalid JSON/)],
      ['empty', 'no body'],
    ]);
  });
});

describe('resolveVariables', () => {
  it('resolves system, file and orderId variables', () => {
    const c = ctx({ variables: { account: 'acc-{{n}}', n: '7', baseUrl: 'http://h' }, orderId: 'ORD-1' });
    const r = resolveVariables(
      '{{$guid}} {{ $guid }} {{$datetime iso8601}} {{$timestamp}} {{$randomInt 1 100}} {{account}} {{orderId}}',
      c,
    );
    expect(r).toEqual({ text: 'uuid-1 uuid-2 2026-10-27T05:44:00.000Z 1793079840 50 acc-7 ORD-1', unresolved: [] });
    expect(resolveVariables('{{orderId}}', ctx({ variables: { orderId: 'FILE' }, orderId: 'ORD-1' })).text).toBe('FILE');
    expect(resolveVariables('no variables', ctx()).text).toBe('no variables');
  });

  it('reports unresolved variables', () => {
    const r = resolveVariables('{{orderId}} {{nope}} {{$dotenv X}} {{$datetime rfc1123}} {{nope}} {{loop}}', ctx({ variables: { loop: '{{loop}}' } }));
    expect(r.unresolved).toEqual(['orderId', 'nope', '$dotenv X', '$datetime rfc1123', 'loop']);
    const check = checkTemplateBody('{"type":"OrderAcceptCmd","orderId":"{{orderId}}"}', 'OrderAcceptCmd', schema('OrderAcceptCmd'), ctx());
    expect(check.unresolved).toEqual(['orderId']);
    expect(check.findings).toEqual([{ path: '{{orderId}}', message: 'unresolved variable' }]);
    expect(checkTemplateBody('{"type":"OrderAcceptCmd","orderId":"{{orderId}}"}', 'OrderAcceptCmd', schema('OrderAcceptCmd'), ctx({ orderId: 'O' }))).toEqual({ findings: [] });
  });
});

describe('inlineFileVariables', () => {
  it('writes the values of variables the target file does not declare', () => {
    const body = '{"account":"{{account}}","s":"{{sessionId}}","base":"{{baseUrl}}","id":"{{$guid}}","o":"{{orderId}}","n":{{qty}}}';
    const vars = { account: 'acc-{{n}}', n: '7', sessionId: 'cockpit', baseUrl: 'http://a', qty: '5' };
    expect(inlineFileVariables(body, vars, { baseUrl: 'http://b', sessionId: 'other' })).toBe(
      '{"account":"acc-7","s":"{{sessionId}}","base":"{{baseUrl}}","id":"{{$guid}}","o":"{{orderId}}","n":5}',
    );
    // a value that uses a system variable keeps it, so it stays fresh per send
    expect(inlineFileVariables('"{{id}}"', { id: 'X-{{$guid}}' }, {})).toBe('"X-{{$guid}}"');
  });
});

describe('templatize', () => {
  it('templatize replaces per-send fields', () => {
    const body = { type: 'OrderCreateCmd', commandId: 'c1', order: { clOrdId: 'X', sendingTime: 't', symbol: 'INTC', transactTime: 't' }, execution: { transactTime: 't' } };
    expect(JSON.parse(templatize(JSON.stringify(body)))).toEqual({
      type: 'OrderCreateCmd',
      commandId: '{{$guid}}',
      order: { clOrdId: '{{$guid}}', sendingTime: '{{$datetime iso8601}}', symbol: 'INTC', transactTime: '{{$datetime iso8601}}' },
      execution: { transactTime: '{{$datetime iso8601}}' },
    });
    expect(Object.keys(JSON.parse(templatize(JSON.stringify(body))).order)).toEqual(['clOrdId', 'sendingTime', 'symbol', 'transactTime']);
    expect(templatize('{ not json')).toBe('{ not json');
  });
});

describe('orderToTemplate', () => {
  it('orderToTemplate keeps client fields and drops server fields', () => {
    const order = {
      id: 12, orderId: 'ORD-1', rootOrderId: 'ORD-1', parentOrderId: null, txNr: 3, state: 'LIVE', cancelState: null,
      cumQty: 0, leavesQty: 500, sessionId: 'test-session', clOrdId: 'old', sendingTime: '2026-10-27T05:44:00Z',
      account: 'account-01', ordType: 'LIMIT', price: 86.96, side: 'BUY', symbol: 'INTC', orderQty: 500,
      securityId: 'INTC.OQ', timeInForce: 'DAY', text: 'Sample order', expireTime: '2026-10-27T21:00:00Z',
    };
    const text = orderToTemplate(order, schema('OrderCreateCmd'));
    const body = JSON.parse(text);
    expect(body.type).toBe('OrderCreateCmd');
    expect(body.order).toEqual({
      sessionId: 'test-session', clOrdId: '{{$guid}}', sendingTime: '{{$datetime iso8601}}', account: 'account-01',
      ordType: 'LIMIT', price: 86.96, side: 'BUY', symbol: 'INTC', orderQty: 500, securityId: 'INTC.OQ', timeInForce: 'DAY', text: 'Sample order',
    });
    expect(Object.keys(body.order)).toEqual(Object.keys(schema('OrderCreateCmd').properties!.order.properties!).filter((k) => k in body.order));
    expect(checkTemplateBody(text, 'OrderCreateCmd', schema('OrderCreateCmd'), ctx())).toEqual({ findings: [] });
  });
});

describe('starter templates', () => {
  it('starter templates cover every command type and pass the check', () => {
    const dir = path.join(REPO_ROOT, 'developer-cockpit', 'api-templates');
    const sources = fs.readdirSync(dir).filter((f) => f.endsWith('.http')).map((f) => source(`developer-cockpit/api-templates/${f}`, fs.readFileSync(path.join(dir, f), 'utf8')));
    const { byType, unusable } = classifyTemplates(sources, catalog.commandTypes);
    expect(unusable).toEqual([]);
    for (const type of catalog.commandTypes) {
      expect(byType[type]?.length ?? 0, type).toBeGreaterThan(0);
      for (const t of byType[type]) {
        const c = ctx({ variables: t.variables, orderId: 'ORD-sample' });
        expect(checkTemplateBody(t.body, type, schema(type), c), `${type} ${t.name}`).toEqual({ findings: [] });
        expect(checkBody(resolveVariables(t.body, c).text, type, schema(type)).parseError, t.name).toBeUndefined();
      }
    }
    const create = byType.OrderCreateCmd.map((t) => JSON.parse(resolveVariables(t.body, ctx({ variables: t.variables })).text).order);
    for (const o of create) expect(o.sessionId, o.symbol).toBeTruthy();
    expect(create.map((o) => o.symbol)).toContain('INTC');
  });

  it('oms-core rest.http create examples pass the contract check (SPEC-0034)', () => {
    const file = parseHttpFile(fs.readFileSync(path.join(REPO_ROOT, 'oms-core', 'rest.http'), 'utf8'));
    const creates = file.requests.filter((r) => r.body && JSON.parse(r.body).type === 'OrderCreateCmd');
    expect(creates.length).toBeGreaterThan(0);
    for (const r of creates) {
      expect(checkBody(r.body!, 'OrderCreateCmd', schema('OrderCreateCmd')), `rest.http:${r.line}`).toEqual({ findings: [] });
    }
  });

  it('oms-cmd-api.yml request examples pass the contract check (SPEC-0034)', () => {
    const spec = yaml.load(fs.readFileSync(path.join(REPO_ROOT, 'oms-contracts', 'src', 'main', 'openapi', 'oms-cmd-api.yml'), 'utf8')) as {
      paths: Record<string, Record<string, { requestBody?: { content?: Record<string, { example?: { type?: string } }> } }>>;
    };
    const examples = Object.entries(spec.paths).flatMap(([p, ops]) =>
      Object.entries(ops).flatMap(([op, o]) =>
        Object.values(o.requestBody?.content ?? {}).filter((c) => c.example).map((c) => ({ at: `${op} ${p}`, example: c.example! }))));
    expect(examples.length).toBeGreaterThan(0);
    for (const { at, example } of examples) {
      expect(catalog.commandTypes, at).toContain(example.type);
      expect(checkBody(JSON.stringify(example), example.type!, schema(example.type!)), at).toEqual({ findings: [] });
    }
  });
});
