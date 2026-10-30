import { describe, expect, it } from 'vitest';
import { sanitizeMermaid, toMermaid } from '../../src/shared/storyboards/mermaid';
import { ext, step, story } from './storyboardFactories';

const example = story([
  step('request-quote', 0, { title: 'Request quote', kind: 'user', from: 'customer', to: 'app' }),
  step('accept-quote', 1, { title: 'Accept quote', kind: 'user', from: 'customer', to: 'app' }),
  step('route-to-market', 2, {
    title: 'Route order to market', from: 'oms', to: 'market',
    extensions: [ext('venue-rejects', { when: 'The venue rejects the instruction', then: 'OMS records the rejection.', continueAt: { kind: 'end' } })],
  }),
  step('fill', 3, { title: 'Fill returned', kind: 'external', from: 'market', to: 'oms' }),
]);

describe('toMermaid', () => {
  it('declares participants in lane order, actor only for actor lanes', () => {
    const lines = toMermaid(example).split('\n');
    expect(lines.slice(0, 5)).toEqual([
      'sequenceDiagram',
      '  actor customer as Customer',
      '  participant app as Mobile App',
      '  participant oms as OMS',
      '  participant market as Market',
    ]);
  });

  it('emits numbered messages in step order, with a response arrow for external steps', () => {
    const messages = toMermaid(example).split('\n').filter((l) => l.includes('>>'));
    expect(messages).toEqual([
      '  customer->>app: 1. Request quote',
      '  customer->>app: 2. Accept quote',
      '  oms->>market: 3. Route order to market',
      '  market-->>oms: 4. Fill returned',
    ]);
  });

  it('turns steps without a full hand-off into notes instead of dropping them', () => {
    const s = story([step('a', 0, { title: 'Only from', from: 'oms' }), step('b', 1, { title: 'Only to', to: 'market' }), step('c', 2, { title: 'Nothing' })]);
    const lines = toMermaid(s).split('\n');
    expect(lines).toContain('  Note over oms: 1. Only from');
    expect(lines).toContain('  Note over market: 2. Only to');
    expect(lines).toContain('  Note over customer: 3. Nothing');
  });

  it('adds an undeclared lane as a fallback participant once', () => {
    const s = story([step('a', 0, { title: 'A', from: 'oms', to: 'backoffice' }), step('b', 1, { title: 'B', from: 'backoffice', to: 'oms' })]);
    const lines = toMermaid(s).split('\n');
    expect(lines.filter((l) => l === '  participant backoffice')).toHaveLength(1);
    expect(lines.indexOf('  participant backoffice')).toBeLessThan(lines.indexOf('  oms->>backoffice: 1. A'));
  });

  it('emits alternate paths only when asked, as balanced opt blocks', () => {
    expect(toMermaid(example)).not.toContain('opt');
    const lines = toMermaid(example, { extensions: true }).split('\n');
    const opens = lines.filter((l) => l.trim().startsWith('opt '));
    const ends = lines.filter((l) => l.trim() === 'end');
    expect(opens).toEqual(['  opt 3a The venue rejects the instruction']);
    expect(ends).toHaveLength(opens.length);
    expect(lines).toContain('    Note over oms,market: Then OMS records the rejection. → end of journey');
    expect(lines.indexOf('  opt 3a The venue rejects the instruction')).toBe(lines.indexOf('  oms->>market: 3. Route order to market') + 1);
  });

  it('describes stay and jump continuations', () => {
    const s = story([
      step('a', 0, { title: 'A', from: 'oms', extensions: [ext('retry', { when: 'busy', then: 'wait', continueAt: { kind: 'stay' } }), ext('skip', { when: 'done', then: 'skip', continueAt: { kind: 'step', step: 'b' } })] }),
      step('b', 1, { title: 'B', from: 'oms' }),
    ]);
    const text = toMermaid(s, { extensions: true });
    expect(text).toContain('Then wait → retry step 1');
    expect(text).toContain('Then skip → continue at step 2');
  });

  it('adds the data of each step as a note when asked', () => {
    const s = story([
      step('a', 0, { title: 'A', from: 'customer', to: 'app', out: [{ name: 'Quote' }] }),
      step('b', 1, { title: 'B', from: 'app', to: 'oms', in: [{ name: 'Quote', origin: { kind: 'step', ref: 'a' } }], out: [{ name: 'Order' }, { name: 'Receipt', final: true }] }),
      step('c', 2, { title: 'C', from: 'oms', to: 'market' }),
    ]);
    expect(toMermaid(s)).not.toContain('Note');
    const lines = toMermaid(s, { data: true }).split('\n');
    expect(lines).toContain('  Note right of app: out Quote');
    expect(lines).toContain('  Note right of oms: in Quote · out Order, Receipt');
    expect(lines.filter((l) => l.includes('Note'))).toHaveLength(2);
    expect(lines.indexOf('  Note right of oms: in Quote · out Order, Receipt')).toBe(lines.indexOf('  app->>oms: 2. B') + 1);
  });

  it('sanitises text that could break or reinterpret the diagram', () => {
    expect(sanitizeMermaid('Validate & submit;\n  order #1 <b>{x}</b>: now')).toBe('Validate & submit order 1 bx/b now');
    const s = story([step('a', 0, { title: 'Evil; end\nNote over oms: pwned', from: 'oms', to: 'market' })]);
    const lines = toMermaid(s).split('\n');
    expect(lines.filter((l) => l.includes('>>'))).toEqual(['  oms->>market: 1. Evil end Note over oms pwned']);
    expect(lines).toHaveLength(6);
  });
});
