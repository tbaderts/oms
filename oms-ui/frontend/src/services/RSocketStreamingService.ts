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
  StreamRequest,
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
  private reconnectTimeout: NodeJS.Timeout | null = null;

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
  public async connect(): Promise<void> {
    if (this.socket) {
      console.log('[RSocketStreamingService] Already connected');
      return;
    }

    this.setConnectionState('connecting');
    console.log(`[RSocketStreamingService] Connecting to ${this.config.wsUrl}`);

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
            console.log('[RSocketStreamingService] Connected successfully');
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

      this.setConnectionState('connected');

      // Handle connection close - RSocket uses closeable pattern
      if (this.socket && typeof this.socket.close === 'function') {
        // Store original close to detect when connection is closed externally
        const originalClose = this.socket.close.bind(this.socket);
        this.socket.close = () => {
          console.log('[RSocketStreamingService] Connection closed');
          this.socket = null;
          this.setConnectionState('disconnected');
          return originalClose();
        };
      }

    } catch (error) {
      console.error('[RSocketStreamingService] Failed to connect:', error);
      this.setConnectionState('error');
      this.scheduleReconnect();
      throw error;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error('[RSocketStreamingService] Max reconnect attempts reached');
      this.setConnectionState('error');
      return;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectDelayMs * Math.pow(2, Math.min(this.reconnectAttempts - 1, 4));
    console.log(`[RSocketStreamingService] Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);
    
    this.setConnectionState('reconnecting');
    this.reconnectTimeout = setTimeout(() => {
      this.connect().catch(err => {
        console.error('[RSocketStreamingService] Reconnect failed:', err);
      });
    }, delay);
  }

  /**
   * Disconnect from the streaming server
   */
  public disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    
    this.setConnectionState('disconnected');
    console.log('[RSocketStreamingService] Disconnected');
  }

  /**
   * Convert UI FilterCondition to StreamFilterCondition
   */
  public convertToStreamFilter(
    uiFilters: FilterCondition[],
    includeSnapshot: boolean = true
  ): StreamFilter {
    const conditions: StreamFilterCondition[] = uiFilters
      .filter(f => f.field && f.value)
      .map(f => this.convertFilterCondition(f));

    return {
      logicalOperator: 'AND',
      filters: conditions,
      includeSnapshot,
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

    console.log('[RSocketStreamingService] Subscribing to orders.stream with filter:', filter);
    
    let active = true;
    let subscription: any = null;

    this.socket.requestStream({
      data: Buffer.from(JSON.stringify(filter)),
      metadata: this.createMetadata('orders.stream'),
    }).subscribe({
      onComplete: () => {
        console.log('[RSocketStreamingService] Orders stream completed');
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
          console.log('[RSocketStreamingService] Received order event:', event.eventType, event.orderId);
          callbacks.onNext(event);
        } catch (e) {
          console.error('[RSocketStreamingService] Failed to parse order event:', e);
        }
      },
      onSubscribe: (sub: any) => {
        subscription = sub;
        sub.request(2147483647); // Request unlimited events
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

    console.log('[RSocketStreamingService] Subscribing to executions.stream');
    
    let active = true;
    let subscription: any = null;

    this.socket.requestStream({
      data: Buffer.from(JSON.stringify(filter)),
      metadata: this.createMetadata('executions.stream'),
    }).subscribe({
      onComplete: () => {
        console.log('[RSocketStreamingService] Executions stream completed');
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
          console.log('[RSocketStreamingService] Received execution event:', event.eventType, event.execId);
          callbacks.onNext(event);
        } catch (e) {
          console.error('[RSocketStreamingService] Failed to parse execution event:', e);
        }
      },
      onSubscribe: (sub: any) => {
        subscription = sub;
        sub.request(2147483647); // Request unlimited events
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
   * Subscribe to blotter stream (unified orders + executions)
   */
  public subscribeToBlotter(
    request: StreamRequest,
    callbacks: StreamingCallbacks<OrderEvent | ExecutionEvent>
  ): StreamSubscription {
    if (!this.socket) {
      callbacks.onError(new Error('Not connected to streaming server'));
      return { unsubscribe: () => {}, isActive: () => false };
    }

    console.log('[RSocketStreamingService] Subscribing to blotter.stream:', request);
    
    let active = true;
    let subscription: any = null;

    this.socket.requestStream({
      data: Buffer.from(JSON.stringify(request)),
      metadata: this.createMetadata('blotter.stream'),
    }).subscribe({
      onComplete: () => {
        console.log('[RSocketStreamingService] Blotter stream completed');
        active = false;
        callbacks.onComplete();
      },
      onError: (error: Error) => {
        console.error('[RSocketStreamingService] Blotter stream error:', error);
        active = false;
        callbacks.onError(error);
      },
      onNext: (payload: any) => {
        try {
          const event = JSON.parse(payload.data.toString());
          console.log('[RSocketStreamingService] Received blotter event:', event);
          callbacks.onNext(event);
        } catch (e) {
          console.error('[RSocketStreamingService] Failed to parse blotter event:', e);
        }
      },
      onSubscribe: (sub: any) => {
        subscription = sub;
        sub.request(2147483647);
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
