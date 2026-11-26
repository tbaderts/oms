// RSocketStreamingService.ts - RSocket client for real-time order/execution streaming
import {
  RSocketClient,
  BufferEncoders,
  MESSAGE_RSOCKET_COMPOSITE_METADATA,
  MESSAGE_RSOCKET_ROUTING,
  encodeCompositeMetadata,
  encodeRoute,
} from 'rsocket-core';
import RSocketWebSocketClient from 'rsocket-websocket-client';
import {
  StreamFilter,
  StreamFilterCondition,
  OrderEvent,
  ExecutionEvent,
  StreamingConnectionState,
  StreamingConfig,
  StreamingCallbacks,
  StreamSubscription,
  DEFAULT_STREAMING_CONFIG,
  StreamingOrderDto,
} from '../types/streaming';
import { FilterCondition } from '../types/types';

// Import Buffer for browser environment
import { Buffer } from 'buffer';

/**
 * Events requested from the server at a time (SPEC-0057). The client asks for more, half a batch at
 * a time, only after it has processed that many, so at most one batch is outstanding: a slow blotter
 * applies back-pressure instead of the stream being buffered without limit.
 */
export const STREAM_BATCH = 256;

/** Requests the first batch and returns the hook to call after each event has been processed. */
function boundedDemand(sub: { request: (n: number) => void }): () => void {
  let processedSinceRequest = 0;
  sub.request(STREAM_BATCH);
  return () => {
    processedSinceRequest++;
    if (processedSinceRequest >= STREAM_BATCH / 2) {
      processedSinceRequest = 0;
      sub.request(STREAM_BATCH / 2);
    }
  };
}

/**
 * RSocket streaming service for real-time order and execution updates
 * Implements the filtered streaming protocol as specified in FILTERED_STREAMING.md
 */
export class RSocketStreamingService {
  private static instance: RSocketStreamingService | null = null;
  private client: RSocketClient<any, any> | null = null;
  private socket: any = null;
  private config: StreamingConfig;
  private connectionState: StreamingConnectionState = 'disconnected';
  private connectionStateListeners: Set<(state: StreamingConnectionState) => void> = new Set();
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  /** The connect in progress: concurrent callers (two blotters) share it instead of opening two. */
  private connecting: Promise<void> | null = null;
  /** Set by disconnect(): a connection the user closed is not re-established. */
  private closedByUser = false;

  private constructor(config?: Partial<StreamingConfig>) {
    this.config = { ...DEFAULT_STREAMING_CONFIG, ...config };
  }

  public static getInstance(config?: Partial<StreamingConfig>): RSocketStreamingService {
    if (!RSocketStreamingService.instance) {
      RSocketStreamingService.instance = new RSocketStreamingService(config);
    }
    return RSocketStreamingService.instance;
  }

  /**
   * Update streaming configuration (e.g., WebSocket URL)
   */
  public updateConfig(config: Partial<StreamingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current connection state
   */
  public getConnectionState(): StreamingConnectionState {
    return this.connectionState;
  }

  /**
   * Add listener for connection state changes
   */
  public addConnectionStateListener(listener: (state: StreamingConnectionState) => void): void {
    this.connectionStateListeners.add(listener);
  }

  /**
   * Remove connection state listener
   */
  public removeConnectionStateListener(listener: (state: StreamingConnectionState) => void): void {
    this.connectionStateListeners.delete(listener);
  }

  private setConnectionState(state: StreamingConnectionState): void {
    this.connectionState = state;
    this.connectionStateListeners.forEach(listener => listener(state));
  }

  /**
   * Connect to the RSocket streaming server
   */
  public connect(): Promise<void> {
    this.closedByUser = false;
    if (this.socket) {
      return Promise.resolve();
    }
    if (!this.connecting) {
      // An explicit connect replaces a pending retry.
      this.clearReconnectTimer();
      this.connecting = this.openConnection().finally(() => {
        this.connecting = null;
      });
    }
    return this.connecting;
  }

  private async openConnection(): Promise<void> {
    this.setConnectionState('connecting');
    console.info(`[RSocketStreamingService] Connecting to ${this.config.wsUrl}`);

    try {
      this.client = new RSocketClient({
        setup: {
          keepAlive: this.config.heartbeatIntervalMs,
          lifetime: 180000,
          dataMimeType: 'application/json',
          metadataMimeType: MESSAGE_RSOCKET_COMPOSITE_METADATA.string,
        },
        transport: new RSocketWebSocketClient(
          { url: this.config.wsUrl },
          BufferEncoders
        ),
      });

      this.socket = await new Promise((resolve, reject) => {
        this.client!.connect().subscribe({
          onComplete: (socket: any) => {
            this.reconnectAttempts = 0;
            resolve(socket);
          },
          onError: (error: Error) => {
            console.error('[RSocketStreamingService] Connection failed:', error);
            reject(error);
          },
          onSubscribe: (_cancel: any) => {
            // Connection in progress
          },
        });
      });

      if (this.closedByUser) {
        // Disconnected while connecting: close what just opened.
        const opened = this.socket;
        this.socket = null;
        this.client = null;
        opened?.close?.();
        return;
      }
      this.setConnectionState('connected');
      this.watchConnection(this.socket);
    } catch (error) {
      console.error('[RSocketStreamingService] Failed to connect:', error);
      this.client = null;
      this.setConnectionState('error');
      if (!this.closedByUser) {
        this.scheduleReconnect();
      }
      throw error;
    }
  }

  /**
   * Notices when the connection goes away without disconnect(): the server restarted or closed it,
   * the network dropped, or keep-alives stopped. The streams on it have ended with an error; the
   * connection is opened again, and the blotters re-subscribe when it reports connected.
   */
  private watchConnection(socket: any): void {
    socket.connectionStatus?.().subscribe({
      onNext: (status: { kind: string; error?: Error }) => {
        if (status.kind !== 'CLOSED' && status.kind !== 'ERROR') return;
        // A late status from a connection already replaced or closed on purpose changes nothing.
        if (this.socket !== socket || this.closedByUser) return;
        console.warn('[RSocketStreamingService] Connection lost:', status.error?.message ?? status.kind);
        this.socket = null;
        this.client = null;
        this.scheduleReconnect();
      },
      onSubscribe: (subscription: any) => subscription.request(Number.MAX_SAFE_INTEGER),
    });
  }

  /**
   * Retries with exponential backoff, capped at 16 times the base delay, until it connects (or the
   * configured attempts run out). A successful connect starts from the first delay again.
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error('[RSocketStreamingService] Max reconnect attempts reached');
      this.setConnectionState('error');
      return;
    }

    this.clearReconnectTimer();
    this.reconnectAttempts++;
    const delay = this.config.reconnectDelayMs * Math.pow(2, Math.min(this.reconnectAttempts - 1, 4));
    console.warn(`[RSocketStreamingService] Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);

    this.setConnectionState('reconnecting');
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect().catch(err => {
        console.error('[RSocketStreamingService] Reconnect failed:', err);
      });
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  /**
   * Disconnect from the streaming server. The connection stays closed until connect() is called.
   */
  public disconnect(): void {
    this.closedByUser = true;
    this.clearReconnectTimer();
    this.reconnectAttempts = 0;

    const socket = this.socket;
    this.socket = null;
    this.client = null;
    socket?.close();

    this.setConnectionState('disconnected');
  }

  /**
   * Convert UI FilterCondition to StreamFilterCondition
   */
  public convertToStreamFilter(
    uiFilters: FilterCondition[],
    includeSnapshot: boolean = true,
    snapshotLimit?: number
  ): StreamFilter {
    const conditions: StreamFilterCondition[] = uiFilters
      .filter(f => f.field && f.value)
      .map(f => this.convertFilterCondition(f));

    return {
      logicalOperator: 'AND',
      filters: conditions,
      includeSnapshot,
      // At most this many snapshot rows, the newest (SPEC-0057); omitted: unbounded
      ...(snapshotLimit !== undefined ? { snapshotLimit } : {}),
    };
  }

  private convertFilterCondition(filter: FilterCondition): StreamFilterCondition {
    // Map UI operation format to streaming operator format
    const operatorMap: { [key: string]: StreamFilterCondition['operator'] } = {
      '': 'EQ',
      '__like': 'LIKE',
      '__gt': 'GT',
      '__gte': 'GTE',
      '__lt': 'LT',
      '__lte': 'LTE',
      '__between': 'BETWEEN',
    };

    const operator = operatorMap[filter.operation] || 'EQ';
    
    // Convert value to string format expected by streaming service
    let value = String(filter.value);
    
    // Handle LIKE pattern - remove wrapping % as streaming service handles this differently
    if (operator === 'LIKE' && value.startsWith('%') && value.endsWith('%')) {
      value = value.slice(1, -1);
    }

    const condition: StreamFilterCondition = {
      field: filter.field,
      operator,
      value,
    };

    // Add value2 for BETWEEN operator
    if (operator === 'BETWEEN' && filter.value2) {
      condition.value2 = String(filter.value2);
    }

    return condition;
  }

  /**
   * Create metadata with routing information
   */
  private createMetadata(route: string): Buffer {
    const routeBuffer = encodeRoute(route);
    return encodeCompositeMetadata([
      [MESSAGE_RSOCKET_ROUTING, routeBuffer],
    ]);
  }

  /**
   * Subscribe to order events stream
   */
  public subscribeToOrders(
    filter: StreamFilter,
    callbacks: StreamingCallbacks<OrderEvent>
  ): StreamSubscription {
    if (!this.socket) {
      callbacks.onError(new Error('Not connected to streaming server'));
      return { unsubscribe: () => {}, isActive: () => false };
    }

    console.info('[RSocketStreamingService] Subscribing to orders.stream');
    
    let active = true;
    let subscription: any = null;
    let demand: (() => void) | null = null;

    this.socket.requestStream({
      data: Buffer.from(JSON.stringify(filter)),
      metadata: this.createMetadata('orders.stream'),
    }).subscribe({
      onComplete: () => {
        active = false;
        callbacks.onComplete();
      },
      onError: (error: Error) => {
        console.error('[RSocketStreamingService] Orders stream error:', error);
        active = false;
        callbacks.onError(error);
      },
      onNext: (payload: any) => {
        try {
          const event = JSON.parse(payload.data.toString()) as OrderEvent;
          callbacks.onNext(event);
        } catch (e) {
          console.error('[RSocketStreamingService] Failed to parse order event:', e);
        } finally {
          demand?.();
        }
      },
      onSubscribe: (sub: any) => {
        subscription = sub;
        demand = boundedDemand(sub);
      },
    });

    return {
      unsubscribe: () => {
        if (subscription) {
          subscription.cancel();
          active = false;
        }
      },
      isActive: () => active,
    };
  }

  /**
   * Subscribe to execution events stream
   */
  public subscribeToExecutions(
    filter: StreamFilter,
    callbacks: StreamingCallbacks<ExecutionEvent>
  ): StreamSubscription {
    if (!this.socket) {
      callbacks.onError(new Error('Not connected to streaming server'));
      return { unsubscribe: () => {}, isActive: () => false };
    }

    console.info('[RSocketStreamingService] Subscribing to executions.stream');
    
    let active = true;
    let subscription: any = null;
    let demand: (() => void) | null = null;

    this.socket.requestStream({
      data: Buffer.from(JSON.stringify(filter)),
      metadata: this.createMetadata('executions.stream'),
    }).subscribe({
      onComplete: () => {
        active = false;
        callbacks.onComplete();
      },
      onError: (error: Error) => {
        console.error('[RSocketStreamingService] Executions stream error:', error);
        active = false;
        callbacks.onError(error);
      },
      onNext: (payload: any) => {
        try {
          const event = JSON.parse(payload.data.toString()) as ExecutionEvent;
          callbacks.onNext(event);
        } catch (e) {
          console.error('[RSocketStreamingService] Failed to parse execution event:', e);
        } finally {
          demand?.();
        }
      },
      onSubscribe: (sub: any) => {
        subscription = sub;
        demand = boundedDemand(sub);
      },
    });

    return {
      unsubscribe: () => {
        if (subscription) {
          subscription.cancel();
          active = false;
        }
      },
      isActive: () => active,
    };
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<boolean> {
    if (!this.socket) {
      return false;
    }

    return new Promise((resolve) => {
      this.socket.requestResponse({
        data: null,  // Empty data for health check
        metadata: this.createMetadata('health'),
      }).subscribe({
        onComplete: (payload: any) => {
          const response = typeof payload.data === 'string' 
            ? payload.data 
            : payload.data?.toString?.() || '';
          resolve(response === 'OK');
        },
        onError: () => resolve(false),
        onSubscribe: () => {},
      });
    });
  }

  /**
   * Helper to create a simple filter for a single field
   */
  public static createSymbolFilter(symbol: string, includeSnapshot = true): StreamFilter {
    return {
      filters: [{ field: 'symbol', operator: 'EQ', value: symbol }],
      includeSnapshot,
    };
  }

  /**
   * Helper to create a filter for side
   */
  public static createSideFilter(side: 'BUY' | 'SELL', includeSnapshot = true): StreamFilter {
    return {
      filters: [{ field: 'side', operator: 'EQ', value: side }],
      includeSnapshot,
    };
  }

  /**
   * Helper to create a filter for order state
   */
  public static createStateFilter(state: string, includeSnapshot = true): StreamFilter {
    return {
      filters: [{ field: 'state', operator: 'EQ', value: state }],
      includeSnapshot,
    };
  }

  /**
   * Create empty filter (all orders with snapshot)
   */
  public static createEmptyFilter(includeSnapshot = true): StreamFilter {
    return {
      filters: [],
      includeSnapshot,
    };
  }

  /**
   * Convert StreamingOrderDto to Order for grid compatibility
   */
  public static normalizeOrderEvent(event: OrderEvent): StreamingOrderDto {
    const order = event.order;
    // Map streaming fields to grid-expected fields
    return {
      ...order,
      id: order.orderId || order.id,
      ordStatus: order.state || order.ordStatus,
    };
  }
}

export default RSocketStreamingService;
