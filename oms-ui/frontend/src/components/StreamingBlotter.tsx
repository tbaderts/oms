// StreamingBlotter.tsx - Real-time blotter component with RSocket streaming
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { GridApi, GridReadyEvent, RowDoubleClickedEvent, GetRowIdParams } from 'ag-grid-community';
import { omsGridTheme } from '../theme/agGridTheme';
import { DomainObjectType, FilterCondition } from '../types/types';
import {
  StreamFilter,
  OrderEvent,
  ExecutionEvent,
  StreamingConnectionState,
  StreamSubscription,
  StreamingOrderDto,
} from '../types/streaming';
import { RSocketStreamingService } from '../services/RSocketStreamingService';
import { ConfigService, DEFAULT_STREAMING_URL } from '../services/ConfigService';
import { ColumnConfigService } from '../services/ColumnConfigService';
import { BlotterStateService } from '../services/BlotterStateService';
import { MetamodelService } from '../services/MetamodelService';
import { convertFiltersToState, convertFiltersFromState } from '../services/filterUtils';
import FilterBuilder from './FilterBuilder';
import ColumnSelector from './ColumnSelector';
import DetailModal from './DetailModal';
import './Blotter.scss';

interface StreamingBlotterProps {
  domainObject: DomainObjectType;
  streamingUrl?: string;
  onModeChange?: (mode: 'streaming' | 'rest') => void;
}

const StreamingBlotter: React.FC<StreamingBlotterProps> = ({
  domainObject,
  streamingUrl,
  onModeChange,
}) => {
  // Data state - use Map for efficient updates by orderId
  const [dataMap, setDataMap] = useState<Map<string, StreamingOrderDto>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterCondition[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [showFilterBuilder, setShowFilterBuilder] = useState(false);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [serviceReady, setServiceReady] = useState(false);
  
  // Streaming state
  const [connectionState, setConnectionState] = useState<StreamingConnectionState>('disconnected');
  const [eventCount, setEventCount] = useState(0);
  const [lastEventTime, setLastEventTime] = useState<string | null>(null);
  const [includeSnapshot, setIncludeSnapshot] = useState(true);

  const gridRef = useRef<AgGridReact>(null);
  const gridApiRef = useRef<GridApi | null>(null);
  const subscriptionRef = useRef<StreamSubscription | null>(null);
  const streamingServiceRef = useRef<RSocketStreamingService | null>(null);
  const connectionStateHandlerRef = useRef<((state: StreamingConnectionState) => void) | null>(null);
  
  const metamodelService = MetamodelService.getInstance();
  const columnConfigService = ColumnConfigService.getInstance();
  const stateService = BlotterStateService.getInstance();

  // Convert Map to array for AG Grid
  const data = useMemo(() => Array.from(dataMap.values()), [dataMap]);

  // Get row ID for AG Grid (enables efficient updates)
  const getRowId = useCallback((params: GetRowIdParams) => {
    return params.data.orderId || params.data.id;
  }, []);

  // Initialize streaming service with config
  useEffect(() => {
    const initService = async () => {
      // Resolve streaming URL: explicit prop > backend config > default
      let wsUrl = streamingUrl;
      if (!wsUrl) {
        try {
          const config = await ConfigService.getConfig();
          wsUrl = config.streamingUrl || DEFAULT_STREAMING_URL;
        } catch (e) {
          console.warn('[StreamingBlotter] Failed to get config, using default URL');
          wsUrl = DEFAULT_STREAMING_URL;
        }
      }

      const service = RSocketStreamingService.getInstance({ wsUrl });
      streamingServiceRef.current = service;

      const handleConnectionStateChange = (state: StreamingConnectionState) => {
        setConnectionState(state);
        if (state === 'error') {
          setError('Connection to streaming server failed');
        } else if (state === 'connected') {
          setError(null);
        }
      };

      connectionStateHandlerRef.current = handleConnectionStateChange;
      service.addConnectionStateListener(handleConnectionStateChange);
      setServiceReady(true);
    };

    initService();

    return () => {
      // Remove the exact handler that was registered (fixes listener leak)
      const service = streamingServiceRef.current;
      const handler = connectionStateHandlerRef.current;
      if (service && handler) {
        service.removeConnectionStateListener(handler);
      }
      connectionStateHandlerRef.current = null;
    };
  }, [streamingUrl]);

  // Initialize metadata and restore state
  useEffect(() => {
    const initializeBlotter = async () => {
      try {
        await metamodelService.getMetamodelAsync(domainObject);
        const metadata = metamodelService.getMetamodel(domainObject);
        
        // Try to restore saved state from base domain object state
        const savedState = stateService.getState(domainObject);
        
        if (savedState && savedState.visibleColumns && savedState.visibleColumns.length > 0) {
          const restoredFilters = convertFiltersFromState(savedState.filters || {});
          setFilters(restoredFilters);
          setVisibleColumns(savedState.visibleColumns);
        } else {
          setVisibleColumns(metadata.defaultColumns);
        }
        
        setInitialized(true);
      } catch (err: any) {
        setError(err.message);
      }
    };

    initializeBlotter();
  }, [domainObject]);

  // Save state when it changes (use same key as REST blotter for shared state)
  useEffect(() => {
    if (initialized) {
      stateService.saveState(domainObject, {
        filters: convertFiltersToState(filters),
        visibleColumns,
        sortModel: [],
        pageSize: 0,
        currentPage: 0,
      });
    }
  }, [filters, visibleColumns, domainObject, initialized]);

  // Connect and subscribe when initialized, service ready, or filters change
  useEffect(() => {
    if (!initialized || !serviceReady || !streamingServiceRef.current) return;

    const connectAndSubscribe = async () => {
      const service = streamingServiceRef.current!;
      
      // Disconnect existing subscription
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }

      setLoading(true);
      setDataMap(new Map()); // Clear existing data
      setEventCount(0);

      try {
        // Connect if not connected
        if (service.getConnectionState() !== 'connected') {
          await service.connect();
        }

        // Create filter from UI filters
        const streamFilter: StreamFilter = service.convertToStreamFilter(filters, includeSnapshot);

        // Subscribe to order events
        if (domainObject === 'Order') {
          subscriptionRef.current = service.subscribeToOrders(streamFilter, {
            onNext: handleOrderEvent,
            onError: handleStreamError,
            onComplete: handleStreamComplete,
            onConnectionStateChange: setConnectionState,
          });
        } else if (domainObject === 'Execution') {
          subscriptionRef.current = service.subscribeToExecutions(streamFilter, {
            onNext: handleExecutionEvent,
            onError: handleStreamError,
            onComplete: handleStreamComplete,
            onConnectionStateChange: setConnectionState,
          });
        }

        setLoading(false);
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    };

    connectAndSubscribe();

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }
    };
  }, [initialized, serviceReady, filters, includeSnapshot, domainObject]);

  const handleOrderEvent = useCallback((event: OrderEvent) => {
    const order = RSocketStreamingService.normalizeOrderEvent(event);
    const orderId = order.orderId || order.id;
    
    if (!orderId) {
      console.warn('[StreamingBlotter] Order event missing orderId:', event);
      return;
    }

    setDataMap(prev => {
      const newMap = new Map(prev);
      newMap.set(orderId, order);
      return newMap;
    });

    setEventCount(prev => prev + 1);
    setLastEventTime(new Date().toISOString());

    // Flash the updated row if grid is ready
    if (gridApiRef.current) {
      const rowNode = gridApiRef.current.getRowNode(orderId);
      if (rowNode) {
        gridApiRef.current.flashCells({ rowNodes: [rowNode] });
      }
    }
  }, []);

  const handleExecutionEvent = useCallback((event: ExecutionEvent) => {
    const execution = event.execution;
    const execId = execution.execId || execution.id;
    
    if (!execId) {
      console.warn('[StreamingBlotter] Execution event missing execId:', event);
      return;
    }

    setDataMap(prev => {
      const newMap = new Map(prev);
      newMap.set(execId, execution as any);
      return newMap;
    });

    setEventCount(prev => prev + 1);
    setLastEventTime(new Date().toISOString());
  }, []);

  const handleStreamError = useCallback((error: Error) => {
    console.error('[StreamingBlotter] Stream error:', error);
    setError(error.message);
    setLoading(false);
  }, []);

  const handleStreamComplete = useCallback(() => {
    setLoading(false);
  }, []);

  const onGridReady = (params: GridReadyEvent) => {
    gridApiRef.current = params.api;
    params.api.autoSizeAllColumns();
  };

  const onRowDoubleClicked = (event: RowDoubleClickedEvent) => {
    setSelectedItem(event.data);
    setShowDetailModal(true);
  };

  const handleApplyFilters = (newFilters: FilterCondition[]) => {
    setFilters(newFilters);
    setShowFilterBuilder(false);
  };

  const handleApplyColumns = (newColumns: string[]) => {
    setVisibleColumns(newColumns);
    setShowColumnSelector(false);
  };

  const handleReconnect = async () => {
    if (streamingServiceRef.current) {
      streamingServiceRef.current.disconnect();
      setDataMap(new Map());
      setEventCount(0);
      try {
        await streamingServiceRef.current.connect();
      } catch (err) {
        console.error('[StreamingBlotter] Reconnect failed:', err);
      }
    }
  };

  const handleDisconnect = () => {
    if (subscriptionRef.current) {
      subscriptionRef.current.unsubscribe();
      subscriptionRef.current = null;
    }
    if (streamingServiceRef.current) {
      streamingServiceRef.current.disconnect();
    }
  };

  const handleAutoSize = () => {
    gridApiRef.current?.autoSizeAllColumns();
  };

  const getConnectionStatusClass = (): string => {
    switch (connectionState) {
      case 'connected': return 'status-connected';
      case 'connecting': 
      case 'reconnecting': return 'status-connecting';
      case 'error': return 'status-error';
      default: return 'status-disconnected';
    }
  };

  const getConnectionStatusIcon = (): string => {
    switch (connectionState) {
      case 'connected': return '🟢';
      case 'connecting':
      case 'reconnecting': return '🟡';
      case 'error': return '🔴';
      default: return '⚪';
    }
  };

  if (!initialized) {
    return (
      <div className="blotter-container">
        <div className="loading-overlay">Loading metadata...</div>
      </div>
    );
  }

  const columnDefs = columnConfigService.getColumnConfig(domainObject, visibleColumns);
  const metadata = metamodelService.getMetamodel(domainObject);

  return (
    <div className="blotter-container streaming-blotter">
      {/* Toolbar */}
      <div className="blotter-toolbar">
        <div className="toolbar-left">
          <span className="toolbar-icon">📡</span>
          <h2>{metadata.displayName}</h2>
          <span className="record-count">{data.length} records</span>
          <span className={`streaming-status ${getConnectionStatusClass()}`}>
            {getConnectionStatusIcon()} {connectionState}
          </span>
        </div>
        <div className="toolbar-right">
          <button 
            onClick={() => setShowFilterBuilder(true)}
            className={filters.length > 0 ? 'filter-active' : ''}
          >
            🔍 Filters {filters.length > 0 && <span className="filter-badge">{filters.length}</span>}
          </button>
          <button onClick={() => setShowColumnSelector(true)}>📊 Columns</button>
          <button onClick={handleAutoSize}>↔️ Auto-Size</button>
          
          {connectionState === 'connected' ? (
            <button onClick={handleDisconnect} className="disconnect-button">
              ⏹️ Disconnect
            </button>
          ) : (
            <button onClick={handleReconnect} className="connect-button">
              ▶️ Connect
            </button>
          )}
          
          <label className="snapshot-toggle">
            <input
              type="checkbox"
              checked={includeSnapshot}
              onChange={(e) => setIncludeSnapshot(e.target.checked)}
            />
            Include Snapshot
          </label>

          {onModeChange && (
            <button onClick={() => onModeChange('rest')} className="mode-switch-button">
              📋 REST Mode
            </button>
          )}
        </div>
      </div>

      {/* Streaming Info Bar */}
      <div className="streaming-info-bar">
        <span className="event-count">Events: {eventCount}</span>
        {lastEventTime && (
          <span className="last-event">
            Last event: {new Date(lastEventTime).toLocaleTimeString()}
          </span>
        )}
        {loading && <span className="loading-indicator">⏳ Loading snapshot...</span>}
      </div>

      {/* Error Display */}
      {error && (
        <div className="error-message">
          {error}
          <button onClick={handleReconnect} className="retry-button">Retry</button>
        </div>
      )}

      {/* AG Grid */}
      <div className="blotter-grid">
        <AgGridReact
          ref={gridRef}
          theme={omsGridTheme}
          rowData={data}
          columnDefs={columnDefs}
          getRowId={getRowId}
          defaultColDef={{
            sortable: true,
            filter: true,
            resizable: true,
            enableCellChangeFlash: true,
          }}
          rowHeight={28}
          headerHeight={32}
          animateRows={true}
          onGridReady={onGridReady}
          onRowDoubleClicked={onRowDoubleClicked}
        />
      </div>

      {/* Modals */}
      {showFilterBuilder && (
        <FilterBuilder
          domainObject={domainObject}
          currentFilters={filters}
          onApply={handleApplyFilters}
          onClose={() => setShowFilterBuilder(false)}
        />
      )}

      {showColumnSelector && (
        <ColumnSelector
          domainObject={domainObject}
          currentColumns={visibleColumns}
          onApply={handleApplyColumns}
          onClose={() => setShowColumnSelector(false)}
        />
      )}

      {showDetailModal && selectedItem && (
        <DetailModal
          data={selectedItem}
          title={metadata.displayName}
          onClose={() => setShowDetailModal(false)}
        />
      )}
    </div>
  );
};

export default StreamingBlotter;
