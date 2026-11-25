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

/** Where an outbox message stands (SPEC-0075): retried as usual, out of attempts, or held behind a stuck one. */
export type OutboxState = 'PENDING' | 'STUCK' | 'HELD';

/** `OutboxSummaryDto`: the outbox counted by state (SPEC-0075). */
export interface OutboxSummary {
  pending: number;
  stuck: number;
  held: number;
  maxAttempts: number;
  /** When the oldest message still to be published (pending or held) was staged. */
  oldestWaitingCreatedAt?: string | null;
  oldestWaitingAgeSeconds?: number | null;
}

/** `OutboxMessageDto`: one message waiting in the outbox (SPEC-0075). */
export interface OutboxMessageEntry {
  id: number;
  state: OutboxState;
  aggregateType: string;
  topic: string;
  /** The Kafka key (the outbox's aggregate id). */
  key: string;
  orderId?: string | null;
  execId?: string | null;
  aggregateVersion?: number | null;
  payloadType?: string | null;
  createdAt: string;
  attempts: number;
  maxAttempts: number;
  lastError?: string | null;
}

/** `OutboxMessageDetailDto`: a message with its decoded payload; none for a pointer message. */
export interface OutboxMessageDetail extends OutboxMessageEntry {
  payload?: unknown;
  payloadSchemaId?: number | null;
  payloadError?: string | null;
}

/** `PagedOutboxMessageDto`. */
export interface OutboxMessagePage {
  content: OutboxMessageEntry[];
  page: { size: number; totalElements: number; totalPages: number; number: number };
}

/** `DeadLetterTopicDto` (SPEC-0075). */
export interface DeadLetterTopic {
  topic: string;
  partitions: number;
  records: number;
}

/** `DeadLetterRecordDto`: one dead-letter record and the failure Spring Kafka recorded (SPEC-0075). */
export interface DeadLetterRecord {
  topic: string;
  partition: number;
  offset: number;
  timestamp: string;
  key?: string | null;
  originalTopic?: string | null;
  originalPartition?: number | null;
  originalOffset?: number | null;
  originalTimestamp?: string | null;
  exceptionClass?: string | null;
  exceptionMessage?: string | null;
  causeClass?: string | null;
  payloadFormat: 'AVRO' | 'TEXT' | 'BINARY' | 'EMPTY';
  payload?: unknown;
  payloadText?: string | null;
  payloadError?: string | null;
  headers?: Record<string, string>;
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
