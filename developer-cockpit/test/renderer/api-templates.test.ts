import { describe, expect, it } from 'vitest';
import { inlineFileVariables, resolveVariables, type ResolveContext } from '../../src/renderer/lib/api-templates';

function ctx(over: Partial<ResolveContext> = {}): ResolveContext {
  let n = 0;
  return {
    variables: {},
    now: () => new Date('2026-10-27T05:44:00Z'),
    uuid: () => `uuid-${++n}`,
    random: () => 0.5,
    ...over,
  };
}

describe('resolveVariables', () => {
  it('resolves system and file variables', () => {
    const c = ctx({ variables: { owner: 'acc-{{n}}', n: '7', baseUrl: 'http://h' } });
    const r = resolveVariables('{{$guid}} {{ $guid }} {{$datetime iso8601}} {{$timestamp}} {{$randomInt 1 100}} {{owner}} {{baseUrl}}', c);
    expect(r).toEqual({ text: 'uuid-1 uuid-2 2026-10-27T05:44:00.000Z 1793079840 50 acc-7 http://h', unresolved: [] });
    expect(resolveVariables('no variables', ctx()).text).toBe('no variables');
  });

  it('reports unresolved variables once each', () => {
    const r = resolveVariables('{{basketId}} {{nope}} {{$dotenv X}} {{$datetime rfc1123}} {{nope}} {{loop}}', ctx({ variables: { loop: '{{loop}}' } }));
    expect(r.unresolved).toEqual(['basketId', 'nope', '$dotenv X', '$datetime rfc1123', 'loop']);
  });
});

describe('inlineFileVariables', () => {
  it('writes the values of variables the target file does not declare', () => {
    const body = '{"owner":"{{owner}}","s":"{{sessionId}}","base":"{{baseUrl}}","id":"{{$guid}}","b":"{{basketId}}","n":{{qty}}}';
    const vars = { owner: 'acc-{{n}}', n: '7', sessionId: 'cockpit', baseUrl: 'http://a', qty: '5' };
    expect(inlineFileVariables(body, vars, { baseUrl: 'http://b', sessionId: 'other' })).toBe(
      '{"owner":"acc-7","s":"{{sessionId}}","base":"{{baseUrl}}","id":"{{$guid}}","b":"{{basketId}}","n":5}',
    );
    // a value that uses a system variable keeps it, so it stays fresh per send
    expect(inlineFileVariables('"{{id}}"', { id: 'X-{{$guid}}' }, {})).toBe('"X-{{$guid}}"');
  });
});
