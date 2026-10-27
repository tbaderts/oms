import { describe, expect, it } from 'vitest';
import { formatTemplateBlock, isCommandRequest, parseHttpFile, templateName } from '../../src/shared/httpFile';

const FILE = [
  '@baseUrl = http://localhost:8090',
  '@account=account-01',
  '',
  '# @name INTC buy',
  'POST {{baseUrl}}/api/command/execute HTTP/1.1',
  'content-type: application/json',
  '',
  '{',
  '  "type": "OrderCreateCmd"',
  '}',
  '',
  '###',
  'GET http://localhost:8090/api/query/search?symbol=INTC HTTP/1.1',
  '',
  '###',
  '# Market rejects an order (ExecType=8)',
  'POST http://localhost:8090/api/command/execute',
  'Content-Type: application/json',
  '',
  '{"type":"OrderRejectCmd","orderId":"{{orderId}}"}',
  '###',
  '// @name accept',
  'POST http://x/api/command/execute/',
  '',
  '{"type":"OrderAcceptCmd"}',
  '###',
  'http://localhost:8090/api/v1/metamodel',
  '@account = account-02',
].join('\r\n');

describe('parseHttpFile', () => {
  it('parses requests, names, comments and file variables', () => {
    const f = parseHttpFile(FILE);
    expect(f.variables).toEqual({ baseUrl: 'http://localhost:8090', account: 'account-02' });
    expect(f.requests.map((r) => [r.method, r.name, r.comment, r.line])).toEqual([
      ['POST', 'INTC buy', null, 5],
      ['GET', null, null, 13],
      ['POST', null, 'Market rejects an order (ExecType=8)', 17],
      ['POST', 'accept', null, 23],
      ['GET', null, null, 27],
    ]);
    expect(f.requests[0].url).toBe('{{baseUrl}}/api/command/execute');
    expect(f.requests[0].body).toBe('{\n  "type": "OrderCreateCmd"\n}');
    expect(f.requests[1].body).toBeNull();
    expect(f.requests[2].body).toBe('{"type":"OrderRejectCmd","orderId":"{{orderId}}"}');
    expect(f.requests.map(isCommandRequest)).toEqual([true, false, true, true, false]);
    expect(templateName(f.requests[2], 'OrderRejectCmd', 2)).toBe('Market rejects an order (ExecType=8)');
    expect(templateName({ ...f.requests[2], comment: null }, 'OrderRejectCmd', 2)).toBe('OrderRejectCmd #2');
  });

  it('parses an empty file', () => {
    expect(parseHttpFile('')).toEqual({ variables: {}, requests: [] });
  });
});

describe('formatTemplateBlock', () => {
  it('round-trips through parseHttpFile', () => {
    const body = '{\n  "type": "OrderCreateCmd",\n  "order": { "clOrdId": "{{$guid}}" }\n}';
    const block = formatTemplateBlock('My order', '{{baseUrl}}/api/command/execute', body);
    expect(block.startsWith('\n###\n# @name My order\nPOST {{baseUrl}}/api/command/execute HTTP/1.1\n')).toBe(true);
    const [r] = parseHttpFile(`@baseUrl = http://h${block}`).requests;
    expect(r).toMatchObject({ name: 'My order', method: 'POST', body });
    expect(isCommandRequest(r)).toBe(true);
  });
});
