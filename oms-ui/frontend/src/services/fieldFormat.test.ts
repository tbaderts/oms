import {
  execTypeLabel,
  formatNumber,
  formatPrice,
  isIdField,
  isPriceField,
  isQuantityField,
} from './fieldFormat';

describe('fieldFormat (SPEC-0059)', () => {
  test('formats prices with 2 to 8 decimals', () => {
    expect([170, 86.96, 1234.5, 0.12345678].map(formatPrice)).toEqual(['170.00', '86.96', '1,234.50', '0.12345678']);
    expect(formatPrice(null)).toBe('');
    expect(formatPrice(undefined)).toBe('');
  });

  test('formats quantities with separators and only their own decimals', () => {
    expect([1000, 10.5, 0].map(formatNumber)).toEqual(['1,000', '10.5', '0']);
    expect(formatNumber(null)).toBe('');
  });

  test('labels FIX exec types, unknown codes stay as they are', () => {
    expect(execTypeLabel('F')).toBe('Trade');
    expect(['0', '4', '5', '8', 'C', 'G', 'H'].map(execTypeLabel))
      .toEqual(['New', 'Canceled', 'Replaced', 'Rejected', 'Expired', 'Trade Correct', 'Trade Cancel']);
    expect(execTypeLabel('Z')).toBe('Z');
  });

  test('classifies price, quantity and id fields', () => {
    expect(['price', 'stopPx', 'lastPx', 'avgPx', 'strikePrice'].every(isPriceField)).toBe(true);
    expect(isPriceField('orderQty')).toBe(false);
    expect(['orderQty', 'cumQty', 'leavesQty', 'lastQty'].every(isQuantityField)).toBe(true);
    expect(['orderId', 'execId', 'clOrdId', 'rootOrderId', 'parentOrderId'].every(isIdField)).toBe(true);
    expect(isIdField('symbol')).toBe(false);
  });
});
