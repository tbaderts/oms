// types.ts - Common type definitions for OMS UI

export type DomainObjectType = 'Order' | 'Execution' | 'Quote' | 'QuoteRequest';

export interface FieldMetadata {
  name: string;
  displayName: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'enum' | 'object';
  required: boolean;
  enumValues?: Array<{ value: string; label: string }>;
  filterOperations?: string[];
  sortable?: boolean;
  filterable?: boolean;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  isComplexObject?: boolean;
  complexObjectType?: string;
}

export interface DomainObjectMetadata {
  name: string;
  displayName: string;
  fields: FieldMetadata[];
  defaultColumns: string[];
  defaultSort?: string;
  primaryKey: string;
}

export interface FilterCondition {
  field: string;
  operation: string;
  value: any;
  value2?: any;
}

export interface FilterRule {
  id: string;
  field: string;
  operator: string;
  value: any;
  value2?: any;
}

export interface PageResponse<T> {
  content: T[];
  page: {
    totalElements: number;
    totalPages: number;
    size: number;
    number: number;
  };
}

export interface BlotterStateSnapshot {
  filters: { [key: string]: any };
  visibleColumns: string[];
  sortModel: any[];
  pageSize: number;
  currentPage: number;
}

export interface Order {
  id: string;
  clOrdId: string;
  symbol: string;
  side: string;
  orderQty: number;
  ordType: string;
  ordStatus: string;
  currency?: string;
  price?: number;
  sendingTime?: string;
  transactTime?: string;
  [key: string]: any;
}

/**
 * One entry of an order's event log, as `GET /api/query/orders/{orderId}/events` returns it
 * (`OrderEventDto` in oms-query-api.yml, SPEC-0049). Shown by the order History view (SPEC-0074).
 */
export interface OrderEventEntry {
  orderId: string;
  version: number;
  event: string;
  commandId?: string | null;
  resultingState?: string | null;
  timeStamp?: string | null;
  /** The causing command, as accepted by the command API. */
  transaction?: unknown;
  /** The order after the change. */
  orderSnapshot?: unknown;
  correlationId?: string | null;
  causationId?: string | null;
  principal?: string | null;
  source?: string | null;
  /** The fields this event changed: {"<field>": {"from": old, "to": new}}. */
  changes?: Record<string, { from?: unknown; to?: unknown }> | null;
  [key: string]: any;
}

/**
 * One command the OMS received for an order and its outcome, as
 * `GET /api/query/orders/{orderId}/commands` returns it (`CommandLogEntryDto`, SPEC-0049).
 */
export interface CommandLogEntry {
  commandId?: string | null;
  type: string;
  orderId?: string | null;
  receivedAt: string;
  source?: string | null;
  principal?: string | null;
  /** APPLIED, REFUSED or FAILED. */
  outcome: string;
  reason?: string | null;
  /** The version of the event it appended, when applied. */
  eventVersion?: number | null;
  [key: string]: any;
}

export interface Execution {
  id: string;
  execId: string;
  orderId: string;
  execType: string;
  ordStatus: string;
  symbol: string;
  side: string;
  lastQty?: number;
  lastPx?: number;
  [key: string]: any;
}
