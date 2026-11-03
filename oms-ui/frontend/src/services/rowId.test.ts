// rowId.test.ts - Tests for blotter row identity (SPEC-0041)
import { rowIdOf } from './rowId';

describe('rowIdOf', () => {
  it('fills of one order get distinct row ids', () => {
    const first = rowIdOf('Execution', { orderId: 'O-1', execId: 'E-1' });
    const second = rowIdOf('Execution', { orderId: 'O-1', execId: 'E-2' });

    expect(first).not.toEqual(second);
  });

  it('same execId on two orders gives two rows', () => {
    const onFirstOrder = rowIdOf('Execution', { orderId: 'O-1', execId: 'E-1' });
    const onSecondOrder = rowIdOf('Execution', { orderId: 'O-2', execId: 'E-1' });

    expect(onFirstOrder).not.toEqual(onSecondOrder);
  });

  it('orders are still keyed by orderId', () => {
    expect(rowIdOf('Order', { id: 7, orderId: 'O-1' })).toBe('O-1');
    expect(rowIdOf('Order', { id: 7 })).toBe('7');
  });

  it('execution map keeps every fill', () => {
    // The update rule StreamingBlotter applies to each execution event.
    const rows = new Map<string, any>();
    const fills = [
      { orderId: 'O-1', execId: 'E-1' },
      { orderId: 'O-1', execId: 'E-2' },
      { orderId: 'O-2', execId: 'E-1' },
    ];
    fills.forEach(fill => rows.set(rowIdOf('Execution', fill), fill));

    expect(rows.size).toBe(3);
  });

  it('a redelivered fill replaces its own row', () => {
    const rows = new Map<string, any>();
    rows.set(rowIdOf('Execution', { orderId: 'O-1', execId: 'E-1', avgPx: 10 }), 'first');
    rows.set(rowIdOf('Execution', { orderId: 'O-1', execId: 'E-1', avgPx: 10 }), 'again');

    expect(rows.size).toBe(1);
  });
});
