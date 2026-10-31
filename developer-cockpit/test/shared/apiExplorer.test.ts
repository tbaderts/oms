import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { API_PREFIX, FILTER_FIELDS, eventsPath, isLocalHost, toSearchParams } from '../../src/shared/apiExplorer';

const QUERY_API = path.resolve(__dirname, '../../../oms-contracts/src/main/openapi/oms-query-api.yml');

describe('toSearchParams', () => {
  it('builds eq, op and between keys and rejects unknown fields or operators', () => {
    const qs = toSearchParams(
      [
        { field: 'symbol', op: 'eq', value: 'AAPL' },
        { field: 'orderId', op: 'like', value: 'test' },
        { field: 'price', op: 'between', value: '100,200' },
        { field: 'transactTime', op: 'gte', value: '2025-08-29T12:34:56Z' },
        { field: 'state', op: 'eq', value: 'LIVE' },
      ],
      { page: 1, size: 20, sort: 'transactTime,DESC' },
    );
    expect(qs.toString()).toBe(
      'symbol=AAPL&orderId__like=test&price__between=100%2C200&transactTime__gte=2025-08-29T12%3A34%3A56Z&state=LIVE&page=1&size=20&sort=transactTime%2CDESC',
    );
    expect(toSearchParams([], {}).toString()).toBe('');
    expect(() => toSearchParams([{ field: 'symbl', op: 'eq', value: 'X' }], {})).toThrow(/Unknown filter field: symbl/);
    expect(() => toSearchParams([{ field: 'symbol', op: 'gt', value: 'X' }], {})).toThrow(/Operator gt is not valid for symbol/);
    expect(() => toSearchParams([{ field: 'side', op: 'like', value: 'BUY' }], {})).toThrow(/Operator like is not valid for side/);
  });

  it('skips filter rows without a value', () => {
    expect(toSearchParams([{ field: 'symbol', op: 'eq', value: '' }], { page: 0 }).toString()).toBe('page=0');
  });
});

describe('FILTER_FIELDS', () => {
  it('matches the query API description', () => {
    const doc = yaml.load(fs.readFileSync(QUERY_API, 'utf-8')) as { info: { description: string } };
    const described = new Map<string, string>();
    const kinds: Record<string, string> = { String: 'string', Numeric: 'numeric', 'DateTime (Instant)': 'datetime', Enum: 'enum' };
    // Each kind is a "- Kind: a, b," bullet whose list may wrap onto indented continuation lines.
    let kind: string | null = null;
    for (const line of doc.info.description.split('\n')) {
      const m = /^\s*- (String|Numeric|DateTime \(Instant\)|Enum): (.+)$/.exec(line);
      const list = m ? m[2] : kind && /^\s+[a-zA-Z]+(,|$)/.test(line) && !/^\s*-/.test(line) ? line : null;
      kind = m ? kinds[m[1]] : list ? kind : null;
      if (!list || !kind) continue;
      for (const f of list.split(',').map((s) => s.trim()).filter(Boolean)) described.set(f, kind);
    }
    expect(described.size).toBeGreaterThan(0);
    const ours = new Map(FILTER_FIELDS.map((f) => [f.field, f.kind]));
    expect(Object.fromEntries(ours)).toEqual(Object.fromEntries(described));
  });

  it('offers operators by kind', () => {
    const ops = (field: string) => FILTER_FIELDS.find((f) => f.field === field)!.ops;
    expect(ops('symbol')).toEqual(['eq', 'like']);
    expect(ops('price')).toEqual(['eq', 'gt', 'gte', 'lt', 'lte', 'between']);
    expect(ops('ackTime')).toEqual(['eq', 'gt', 'gte', 'lt', 'lte', 'between']);
    expect(ops('side')).toEqual(['eq']);
    expect(FILTER_FIELDS.find((f) => f.field === 'cancelState')!.enumName).toBe('CancelState');
  });
});

describe('eventsPath', () => {
  it('is the contracted event-log operation under the query prefix', () => {
    const spec = yaml.load(fs.readFileSync(QUERY_API, 'utf8')) as { paths: Record<string, unknown> };
    expect(Object.keys(spec.paths)).toContain('/orders/{orderId}/events');
    expect(eventsPath('O 1')).toBe(`${API_PREFIX.query}/orders/O%201/events`);
    expect(eventsPath('O 1')).toBe('/api/query/orders/O%201/events');
  });
});

describe('isLocalHost', () => {
  it('treats localhost, 127.0.0.1 and ::1 as local', () => {
    expect(isLocalHost('http://localhost:8090')).toBe(true);
    expect(isLocalHost('http://127.0.0.1:8090/')).toBe(true);
    expect(isLocalHost('http://[::1]:8090')).toBe(true);
    expect(isLocalHost('https://oms-test.example:443')).toBe(false);
    expect(isLocalHost('http://localhost.example.com')).toBe(false);
    expect(isLocalHost('not a url')).toBe(false);
  });
});
