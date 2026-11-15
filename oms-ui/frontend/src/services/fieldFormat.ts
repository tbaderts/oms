// fieldFormat.ts - How blotter and detail values are shown (SPEC-0059): number formats, FIX ExecType
// labels and the field classes they apply to. One place, used by ColumnConfigService and DetailPanel.

const PRICE = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 });
const NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 });

/** A price with at least 2 and at most 8 decimals ("170.00", "1,234.50"); '' for no value. */
export function formatPrice(value: number | null | undefined): string {
  return value == null ? '' : PRICE.format(value);
}

/** A quantity or other number with separators and only the decimals it has ("1,000", "10.5"). */
export function formatNumber(value: number | null | undefined): string {
  return value == null ? '' : NUMBER.format(value);
}

/** Prices: `price`, `strikePrice`, `stopPx` and every FIX `*Px` field (`lastPx`, `avgPx`, …). */
export function isPriceField(name: string): boolean {
  return name === 'price' || name === 'strikePrice' || name.endsWith('Px');
}

/** Quantities: every `*Qty` field (`orderQty`, `cumQty`, `leavesQty`, `lastQty`, …). */
export function isQuantityField(name: string): boolean {
  return name.endsWith('Qty');
}

const ID_FIELDS = new Set([
  'orderId', 'execId', 'clOrdId', 'origClOrdId', 'rootOrderId', 'parentOrderId', 'quoteId', 'quoteReqId', 'sessionId',
]);

/** Identifier columns, shown wide and start-truncated so their distinguishing end stays visible. */
export function isIdField(name: string): boolean {
  return ID_FIELDS.has(name);
}

/** FIX 4.4 ExecType (tag 150) codes and their names. */
export const EXEC_TYPE_LABELS: Readonly<Record<string, string>> = {
  '0': 'New',
  '3': 'Done for Day',
  '4': 'Canceled',
  '5': 'Replaced',
  '6': 'Pending Cancel',
  '7': 'Stopped',
  '8': 'Rejected',
  '9': 'Suspended',
  A: 'Pending New',
  B: 'Calculated',
  C: 'Expired',
  D: 'Restated',
  E: 'Pending Replace',
  F: 'Trade',
  G: 'Trade Correct',
  H: 'Trade Cancel',
  I: 'Order Status',
};

/** The name of an ExecType code ("F" → "Trade"); an unknown code is returned as it is. */
export function execTypeLabel(code: string): string {
  return EXEC_TYPE_LABELS[code] ?? code;
}
