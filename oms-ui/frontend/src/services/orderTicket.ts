// orderTicket.ts - the order entry ticket (SPEC-0072): what the form holds, how it is checked before
// sending, the OrderCreateCmd it becomes, and how oms-core's answers read back into the form.
//
// The rules mirror oms-core's ValidateOrderTask and the OrderCreateCmd contract
// (oms-contracts/src/main/openapi/oms-cmd-api.yml), so an invalid ticket is caught before sending.

export const SIDES = ['BUY', 'SELL', 'SELL_SHORT'] as const;
export const ORD_TYPES = ['LIMIT', 'MARKET', 'STOP', 'STOP_LIMIT', 'MARKET_ON_CLOSE'] as const;
export const TIMES_IN_FORCE = ['DAY', 'GOOD_TILL_CANCEL', 'IMMEDIATE_OR_CANCEL', 'FILL_OR_KILL', 'AT_THE_OPENING'] as const;
export const HANDL_INSTS = ['AUTO', 'BROKER_INTERVENTION_OK', 'MANUAL'] as const;

export type Side = (typeof SIDES)[number];
export type OrdType = (typeof ORD_TYPES)[number];
export type TimeInForce = (typeof TIMES_IN_FORCE)[number];
export type HandlInst = (typeof HANDL_INSTS)[number];

/** The form's state. Numbers stay text until sent, so the user's input is never reformatted. */
export interface OrderTicket {
  /** One per ticket, kept on every retry of it (AC-4). */
  clOrdId: string;
  symbol: string;
  /** The chosen instrument's name, sent as securityDesc. */
  securityDesc?: string;
  side: Side;
  ordType: OrdType;
  orderQty: string;
  price: string;
  stopPx: string;
  timeInForce: TimeInForce;
  /** datetime-local value (local time), empty for none. */
  expireTime: string;
  settlCurrency: string;
  account: string;
  exDestination: string;
  handlInst: HandlInst;
  text: string;
}

export type TicketField = keyof Omit<OrderTicket, 'clOrdId'>;
export type FieldErrors = Partial<Record<TicketField, string>>;

/** A client order id: unique per ticket, recognisable as entered in oms-ui. */
function newClOrdId(): string {
  const uuid = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `UI-${uuid}`;
}

/** A fresh ticket, with a new clOrdId; `keep` carries fields over (e.g. symbol and account). */
export function newTicket(keep: Partial<OrderTicket> = {}): OrderTicket {
  return {
    symbol: '',
    side: 'BUY',
    ordType: 'LIMIT',
    orderQty: '',
    price: '',
    stopPx: '',
    timeInForce: 'DAY',
    expireTime: '',
    settlCurrency: '',
    account: '',
    exDestination: '',
    handlInst: 'AUTO',
    text: '',
    ...keep,
    clOrdId: newClOrdId(),
  };
}

export const needsPrice = (ordType: OrdType) => ordType === 'LIMIT' || ordType === 'STOP_LIMIT';
export const needsStopPx = (ordType: OrdType) => ordType === 'STOP' || ordType === 'STOP_LIMIT';

/** At most 10 integer digits and 8 decimals, as the contract allows. */
const DECIMAL = /^\d{1,10}(\.\d{1,8})?$/;

/**
 * The command is JSON with JavaScript numbers, which hold 15 significant digits exactly: a longer
 * value would be sent as a different one (or overflow the contract's 10 integer digits).
 */
const MAX_SIGNIFICANT_DIGITS = 15;

function significantDigits(value: string): number {
  return value.replace('.', '').replace(/^0+/, '').length;
}

function positiveDecimal(value: string): boolean {
  const v = value.trim();
  return DECIMAL.test(v) && Number(v) > 0 && significantDigits(v) <= MAX_SIGNIFICANT_DIGITS;
}

/** What is wrong with the ticket, per field; empty when it can be sent (AC-2). */
export function validateTicket(t: OrderTicket, now: Date = new Date()): FieldErrors {
  const errors: FieldErrors = {};
  if (!t.symbol.trim()) errors.symbol = 'Symbol is required';
  if (!t.account.trim()) errors.account = 'Account is required';
  if (!positiveDecimal(t.orderQty)) {
    errors.orderQty = 'Quantity must be a positive number with at most 8 decimals and 15 digits';
  }
  if (needsPrice(t.ordType) && !positiveDecimal(t.price)) {
    errors.price = t.price.trim() ? 'Price must be a positive number with at most 8 decimals and 15 digits' : `Price is required for ${t.ordType} orders`;
  }
  if (needsStopPx(t.ordType) && !positiveDecimal(t.stopPx)) {
    errors.stopPx = t.stopPx.trim() ? 'Stop price must be a positive number with at most 8 decimals and 15 digits' : `Stop price is required for ${t.ordType} orders`;
  }
  if (t.expireTime) {
    const expires = new Date(t.expireTime);
    if (Number.isNaN(expires.getTime()) || expires.getTime() <= now.getTime()) {
      errors.expireTime = 'Expire time must be in the future';
    }
  }
  return errors;
}

/** The OrderCreateCmd for oms-core's POST /api/command/execute; empty optional fields are left out. */
export function toOrderCreateCmd(t: OrderTicket, sessionId: string, now: Date = new Date()) {
  const order: Record<string, string | number> = {
    clOrdId: t.clOrdId,
    sessionId,
    sendingTime: now.toISOString(),
    symbol: t.symbol.trim().toUpperCase(),
    side: t.side,
    ordType: t.ordType,
    orderQty: Number(t.orderQty.trim()),
    timeInForce: t.timeInForce,
    handlInst: t.handlInst,
    account: t.account.trim(),
  };
  if (needsPrice(t.ordType)) order.price = Number(t.price.trim());
  if (needsStopPx(t.ordType)) order.stopPx = Number(t.stopPx.trim());
  if (t.expireTime) order.expireTime = new Date(t.expireTime).toISOString();
  const optional: Array<[string, string | undefined]> = [
    ['settlCurrency', t.settlCurrency], ['exDestination', t.exDestination],
    ['text', t.text], ['securityDesc', t.securityDesc],
  ];
  optional.forEach(([key, value]) => {
    if (value && value.trim()) order[key] = value.trim();
  });
  // Keys in a stable order: the required ones first, as above.
  return { type: 'OrderCreateCmd', version: '1.0.0', order };
}

/** oms-core's refusal, as a message and per-field errors (AC-3). */
export function readRefusal(body: any): { message: string; fields: FieldErrors } {
  const fields: FieldErrors = {};
  if (body && body.errors && typeof body.errors === 'object') {
    Object.entries(body.errors as Record<string, unknown>).forEach(([path, messages]) => {
      const field = path.replace(/^order\./, '') as TicketField;
      const text = Array.isArray(messages) ? messages.join('; ') : String(messages);
      fields[field] = text;
    });
  }
  const message = (body && (body.message || body.detail)) || 'oms-core refused the order';
  return { message, fields };
}

/**
 * Whether oms-core refused this ticket's own clOrdId as a duplicate: then an earlier attempt of this
 * ticket was applied, and the order exists (AC-4).
 */
export function isOwnDuplicate(message: string | undefined, t: OrderTicket, sessionId: string): boolean {
  // oms-core: "Order creation failed: Duplicate order for sessionId=<s> and clOrdId=<c>"
  // (PersistOrderTask's reason, prefixed by CommandDispatcher). Matched to its end, so clOrdId
  // "UI-1" never matches a refusal of "UI-12".
  return !!message && message.endsWith(`Duplicate order for sessionId=${sessionId} and clOrdId=${t.clOrdId}`);
}

/** One line to read before submitting, e.g. "BUY 100 AAPL LIMIT 170.5 DAY for ACC-1". */
export function ticketSummary(t: OrderTicket): string {
  const parts = [t.side, t.orderQty.trim(), t.symbol.trim().toUpperCase(), t.ordType];
  if (needsStopPx(t.ordType) && t.stopPx.trim()) parts.push(`stop ${t.stopPx.trim()}`);
  if (needsPrice(t.ordType) && t.price.trim()) parts.push(t.price.trim());
  parts.push(t.timeInForce);
  return `${parts.join(' ')} for ${t.account.trim()}`;
}
