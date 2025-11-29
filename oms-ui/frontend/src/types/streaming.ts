// streaming.ts - Types for RSocket streaming with OMS Streaming Service

import { Execution } from './types';

/**
 * Filter operator types matching the streaming service spec
 */
export type StreamFilterOperator = 'EQ' | 'LIKE' | 'GT' | 'GTE' | 'LT' | 'LTE' | 'BETWEEN';

/**
 * Logical operator for combining multiple filter conditions
 */
export type LogicalOperator = 'AND' | 'OR';

/**
 * Filter condition for streaming subscriptions
 * Matches the format expected by oms-streaming-service
 */
export interface StreamFilterCondition {
  field: string;
  operator: StreamFilterOperator;
  value: string;
  value2?: string;  // Used with BETWEEN operator
}

/**
 * Stream filter configuration sent to RSocket endpoints
 */
export interface StreamFilter {
  logicalOperator?: LogicalOperator;
  filters: StreamFilterCondition[];
  includeSnapshot: boolean;
}

/**
 * Stream types for the blotter.stream endpoint
 */
export type StreamType = 'ORDERS' | 'EXECUTIONS' | 'ALL';

/**
 * Request format for blotter.stream endpoint
 */
export interface StreamRequest {
  blotterId: string;
  streamType: StreamType;
  filter: StreamFilter;
}

/**
 * Event types from the streaming service
 */
export type OrderEventType = 'SNAPSHOT' | 'UPDATE' | 'CREATE' | 'CACHE';
export type ExecutionEventType = 'NEW' | 'CORRECT' | 'BUST' | 'SNAPSHOT';

/**
 * Order event wrapper from streaming service
 */
export interface OrderEvent {
  eventType: OrderEventType;
  orderId: string;
  eventId: number;
  sequenceNumber: number;
  timestamp: string;
  order: StreamingOrderDto;
}

/**
 * Execution event wrapper from streaming service
 */
export interface ExecutionEvent {
  eventType: ExecutionEventType;
  execId: string;
  orderId: string;
  sequenceNumber: number;
  timestamp: string;
  execution: StreamingExecutionDto;
}

/**
 * Order DTO from streaming service (includes streaming-specific fields)
 */
export interface StreamingOrderDto {
  id?: string;
  orderId: string;
  eventId?: number;
  sequenceNumber?: number;
  eventTime?: string;
  parentOrderId?: string | null;
  rootOrderId?: string;
  clOrdId?: string;
  account?: string;
  symbol: string;
  side: string;
  ordType?: string;
  state?: string;
  ordStatus?: string;
  cancelState?: string | null;
  orderQty?: number;
  cumQty?: number;
  leavesQty?: number;
  price?: number | null;
  avgPx?: number | null;
  stopPx?: number | null;
  timeInForce?: string;
  securityId?: string;
  securityType?: string;
  exDestination?: string;
  text?: string | null;
  sendingTime?: string;
  transactTime?: string;
  expireTime?: string | null;
  cashOrderQty?: number | null;
  currency?: string;
  [key: string]: any;
}

/**
 * Execution DTO from streaming service
 */
export interface StreamingExecutionDto extends Execution {
  executionId?: string;
  lastMkt?: string;
  lastCapacity?: string;
  creationDate?: string;
  sequenceNumber?: number;
  eventTime?: string;
}

/**
 * Connection state for streaming
 */
export type StreamingConnectionState = 
  | 'disconnected' 
  | 'connecting' 
  | 'connected' 
  | 'reconnecting' 
  | 'error';

/**
 * Streaming configuration
 */
export interface StreamingConfig {
  wsUrl: string;
  reconnectDelayMs: number;
  maxReconnectAttempts: number;
  heartbeatIntervalMs: number;
}

/**
 * Default streaming configuration
 */
export const DEFAULT_STREAMING_CONFIG: StreamingConfig = {
  wsUrl: 'ws://localhost:7000/rsocket',
  reconnectDelayMs: 3000,
  maxReconnectAttempts: 10,
  heartbeatIntervalMs: 30000,
};

/**
 * Callback types for streaming subscriptions
 */
export interface StreamingCallbacks<T> {
  onNext: (event: T) => void;
  onError: (error: Error) => void;
  onComplete: () => void;
  onConnectionStateChange?: (state: StreamingConnectionState) => void;
}

/**
 * Subscription handle for managing active subscriptions
 */
export interface StreamSubscription {
  unsubscribe: () => void;
  isActive: () => boolean;
}
