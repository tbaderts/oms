// orderTicket.test.ts - the order entry ticket: validation, command and answers (SPEC-0072)
import {
  newTicket,
  validateTicket,
  toOrderCreateCmd,
  readRefusal,
  isOwnDuplicate,
  ticketSummary,
  OrderTicket,
} from './orderTicket';

const NOW = new Date('2026-11-24T10:00:00Z');

/**
 * oms-core's refusal of a repeated (sessionId, clOrdId), exactly as it sends it: CommandDispatcher
 * prefixes PersistOrderTask's reason with "Order creation failed: " (a 400 CommandResult).
 */
export const omsCoreDuplicate = (sessionId: string, clOrdId: string) =>
  `Order creation failed: Duplicate order for sessionId=${sessionId} and clOrdId=${clOrdId}`;

const limitTicket = (over: Partial<OrderTicket> = {}): OrderTicket => ({
  ...newTicket(),
  symbol: 'AAPL',
  side: 'BUY',
  ordType: 'LIMIT',
  orderQty: '100',
  price: '170.5',
  account: 'ACC-1',
  ...over,
});

describe('newTicket (SPEC-0072 AC-4)', () => {
  it('gives each ticket its own UI- clOrdId', () => {
    const a = newTicket();
    const b = newTicket();
    expect(a.clOrdId).toMatch(/^UI-/);
    expect(a.clOrdId).not.toEqual(b.clOrdId);
  });

  it('keeps symbol and account from the previous ticket when asked, with a new clOrdId', () => {
    const first = limitTicket();
    const next = newTicket({ symbol: first.symbol, account: first.account });
    expect(next.symbol).toBe('AAPL');
    expect(next.account).toBe('ACC-1');
    expect(next.clOrdId).not.toBe(first.clOrdId);
    expect(next.price).toBe('');
  });

  it('defaults to DAY and AUTO', () => {
    expect(newTicket()).toEqual(expect.objectContaining({ timeInForce: 'DAY', handlInst: 'AUTO', side: 'BUY', ordType: 'LIMIT' }));
  });
});

describe('validateTicket (SPEC-0072 AC-2)', () => {
  it('accepts a complete limit order', () => {
    expect(validateTicket(limitTicket(), NOW)).toEqual({});
  });

  it('requires symbol and account', () => {
    expect(validateTicket(limitTicket({ symbol: ' ', account: '' }), NOW)).toEqual({
      symbol: 'Symbol is required',
      account: 'Account is required',
    });
  });

  // A JavaScript number keeps 15 significant digits safely: more would be sent as a different value.
  it.each([['0'], ['-5'], ['abc'], ['1.123456789'], [''], ['1234567890.12345678'], ['9999999999.999999']])(
    'rejects quantity %p', qty => {
      expect(validateTicket(limitTicket({ orderQty: qty }), NOW).orderQty).toBeDefined();
    });

  it('accepts up to 15 significant digits', () => {
    expect(validateTicket(limitTicket({ orderQty: '1234567890.12345', price: '0.00000001' }), NOW)).toEqual({});
  });

  it('needs a price for LIMIT and STOP_LIMIT, a stop price for STOP and STOP_LIMIT', () => {
    expect(validateTicket(limitTicket({ price: '' }), NOW)).toEqual({ price: 'Price is required for LIMIT orders' });
    expect(validateTicket(limitTicket({ ordType: 'STOP', price: '', stopPx: '' }), NOW))
      .toEqual({ stopPx: 'Stop price is required for STOP orders' });
    expect(validateTicket(limitTicket({ ordType: 'STOP_LIMIT', price: '', stopPx: '' }), NOW)).toEqual({
      price: 'Price is required for STOP_LIMIT orders',
      stopPx: 'Stop price is required for STOP_LIMIT orders',
    });
    expect(validateTicket(limitTicket({ ordType: 'MARKET', price: '' }), NOW)).toEqual({});
  });

  it('rejects an expire time in the past', () => {
    expect(validateTicket(limitTicket({ expireTime: '2026-11-24T09:00' }), NOW).expireTime)
      .toBe('Expire time must be in the future');
  });
});

describe('toOrderCreateCmd (SPEC-0072 AC-1)', () => {
  it('maps a limit ticket to the command, omitting empty optional fields', () => {
    const ticket = limitTicket({ settlCurrency: 'USD', text: 'from the desk' });

    expect(toOrderCreateCmd(ticket, 'OMS-UI', NOW)).toEqual({
      type: 'OrderCreateCmd',
      version: '1.0.0',
      order: {
        clOrdId: ticket.clOrdId,
        sessionId: 'OMS-UI',
        sendingTime: '2026-11-24T10:00:00.000Z',
        symbol: 'AAPL',
        side: 'BUY',
        ordType: 'LIMIT',
        orderQty: 100,
        price: 170.5,
        timeInForce: 'DAY',
        handlInst: 'AUTO',
        account: 'ACC-1',
        settlCurrency: 'USD',
        text: 'from the desk',
      },
    });
  });

  it('sends no price for a market order and a stop price for a stop order', () => {
    expect(toOrderCreateCmd(limitTicket({ ordType: 'MARKET' }), 'S', NOW).order).not.toHaveProperty('price');
    const stop = toOrderCreateCmd(limitTicket({ ordType: 'STOP', price: '', stopPx: '165' }), 'S', NOW).order;
    expect(stop.stopPx).toBe(165);
    expect(stop).not.toHaveProperty('price');
  });

  it('sends the expire time as an instant and the instrument name as securityDesc', () => {
    const order = toOrderCreateCmd(
      limitTicket({ expireTime: '2026-11-25T16:00', securityDesc: 'Apple Inc.', exDestination: 'XNAS' }), 'S', NOW).order;
    expect(order.expireTime).toBe(new Date('2026-11-25T16:00').toISOString());
    expect(order.securityDesc).toBe('Apple Inc.');
    expect(order.exDestination).toBe('XNAS');
  });
});

describe('readRefusal (SPEC-0072 AC-3)', () => {
  it('maps a validation problem to the form fields', () => {
    expect(readRefusal({
      type: 'urn:oms:error:validation-failed',
      detail: 'Validation failed for one or more fields',
      errors: { 'order.price': ['must be greater than 0'], 'order.account': ['size must be between 1 and 2147483647'] },
    })).toEqual({
      message: 'Validation failed for one or more fields',
      fields: { price: 'must be greater than 0', account: 'size must be between 1 and 2147483647' },
    });
  });

  it('reads a refused command result', () => {
    expect(readRefusal({ status: 'FAILED', message: 'Limit orders must have a price' }))
      .toEqual({ message: 'Limit orders must have a price', fields: {} });
  });

  it('falls back to a generic message', () => {
    expect(readRefusal(undefined)).toEqual({ message: 'oms-core refused the order', fields: {} });
  });
});

describe('isOwnDuplicate (SPEC-0072 AC-4)', () => {
  it('recognises the refusal of this ticket\'s own clOrdId, worded as oms-core sends it', () => {
    const ticket = limitTicket();
    expect(isOwnDuplicate(omsCoreDuplicate('OMS-UI', ticket.clOrdId), ticket, 'OMS-UI')).toBe(true);
  });

  it('does not take another ticket\'s or session\'s duplicate, or another refusal, for its own', () => {
    const ticket = limitTicket();
    expect(isOwnDuplicate(omsCoreDuplicate('OMS-UI', ticket.clOrdId + 'X'), ticket, 'OMS-UI')).toBe(false);
    expect(isOwnDuplicate(omsCoreDuplicate('OTHER', ticket.clOrdId), ticket, 'OMS-UI')).toBe(false);
    expect(isOwnDuplicate('Order creation failed: Limit orders must have a price', ticket, 'OMS-UI')).toBe(false);
  });
});

describe('ticketSummary', () => {
  it('reads like an order', () => {
    expect(ticketSummary(limitTicket())).toBe('BUY 100 AAPL LIMIT 170.5 DAY for ACC-1');
    expect(ticketSummary(limitTicket({ ordType: 'MARKET' }))).toBe('BUY 100 AAPL MARKET DAY for ACC-1');
  });
});
