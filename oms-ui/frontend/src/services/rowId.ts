// rowId.ts - Row identity for the blotters (SPEC-0041)
import { DomainObjectType } from '../types/types';

/**
 * The business key of a blotter row, used as the AG Grid row id and as the key of the streaming
 * blotter's row map, in REST and streaming mode alike.
 *
 * - Order: `orderId` (the surrogate `id` only as a fallback).
 * - Execution: `orderId` + `execId`. A venue's execId is unique per order only, so it cannot
 *   identify a fill on its own.
 */
export function rowIdOf(domainObject: DomainObjectType, row: any): string {
  if (domainObject === 'Execution') {
    return `${row.orderId}|${row.execId}`;
  }
  return row.orderId ?? String(row.id);
}
