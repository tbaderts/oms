// StreamingBlotter.tsx - Real-time blotter component with RSocket streaming
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { GridApi, GridReadyEvent, RowDoubleClickedEvent, GetRowIdParams } from 'ag-grid-community';
import { omsGridTheme } from '../theme/agGridTheme';
import { FIT_COLUMNS_TO_WIDTH, fitColumnsOnResize } from '../theme/gridSizing';
import Icon from './icons/Icon';
import '../theme/agGridModules';
import { DomainObjectType, FilterCondition } from '../types/types';
import {
  StreamFilter,
  OrderEvent,
  ExecutionEvent,
  StreamingConnectionState,
  StreamSubscription,
} from '../types/streaming';
import { RSocketStreamingService } from '../services/RSocketStreamingService';
import { ConfigService, DEFAULT_STREAMING_URL, DEFAULT_MAX_STREAMING_ROWS, getMaxStreamingRows } from '../services/ConfigService';
import { RowStore } from '../services/rowStore';
import { scheduleFrame } from '../services/frameScheduler';
import { ColumnConfigService } from '../services/ColumnConfigService';
import { BlotterStateService } from '../services/BlotterStateService';
import { MetamodelService } from '../services/MetamodelService';
import { convertFiltersToState, convertFiltersFromState, sameSavedFilters } from '../services/filterUtils';
import { rowIdOf } from '../services/rowId';
import FilterBuilder from './FilterBuilder';
import ColumnSelector from './ColumnSelector';
import { mergeLiveSelection, splitColumns, streamedFieldsOf } from '../services/streamedFields';
import DetailModal from './DetailModal';
import './Blotter.scss';

interface StreamingBlotterProps {
  domainObject: DomainObjectType;
  streamingUrl?: string;
  maxRows?: number;
  /**
   * Whether this blotter's view is the one shown (SPEC-0056). Views are kept mounted while hidden;
   * a hidden blotter keeps streaming but does not save its state, and re-reads the shared saved
   * columns and filters when it is shown again, since the paging blotter may have changed them.
   */
  active?: boolean;
  /**
   * The stream to read (SPEC-0057). Defaults to the shared RSocket connection; the load harness
   * passes a synthetic one, so its events take the same path as real ones.
   */
  streamingService?: StreamingServiceLike;
  /** Called after each grid transaction with the number of events it now reflects (load harness). */
  onFlush?: (eventsApplied: number) => void;
  /** Whether column and filter choices are saved (default true); the load harness saves none. */
  persistState?: boolean;
}

/** What the blotter needs from a stream: the RSocket service, or the load harness's synthetic one. */
export type StreamingServiceLike = Pick<RSocketStreamingService,
  | 'addConnectionStateListener'
  | 'removeConnectionStateListener'
  | 'getConnectionState'
  | 'connect'
  | 'disconnect'
  | 'convertToStreamFilter'
  | 'subscribeToOrders'
  | 'subscribeToExecutions'>;

/**
 * The grid's initial rows: none. AG Grid shows its loading overlay and renders no rows until it is
 * given rowData once, so it gets this empty array, the same on every render, and every row after it
 * by transaction (SPEC-0057).
 */
const NO_ROWS: any[] = [];

/** One object for every render, so AG Grid does not re-apply column defaults each frame (SPEC-0057). */
const DEFAULT_COL_DEF = {
  sortable: true,
  filter: true,
  resizable: true,
  enableCellChangeFlash: true,
};

/**
 * Without a SNAPSHOT_END marker (an older server), the snapshot counts as complete once no snapshot
 * row has arrived for this long (SPEC-0057).
 */
const SNAPSHOT_QUIET_MS = 1000;

/** A performance mark, where the browser supports them (SPEC-0057 AC-11). */
function markPerformance(name: string): void {
  try {
    performance.mark?.(name);
  } catch {
    // Marks are diagnostics only.
  }
}

/** Records how long the snapshot took from subscribing until it was in the grid (SPEC-0057 AC-11). */
function recordSnapshotShown(domainObject: string, startedAt: number, rows: number): void {
  markPerformance(`oms:snapshot-shown:${domainObject}`);
  try {
    performance.measure?.(`oms:snapshot:${domainObject}`, `oms:subscribe:${domainObject}`, `oms:snapshot-shown:${domainObject}`);
  } catch {
    // The subscribe mark may be missing (cleared by the browser); the log below still has the time.
  }
  const elapsed = Math.round(performance.now() - startedAt);
  console.info(`[StreamingBlotter] ${domainObject} snapshot shown: ${rows} rows in ${elapsed} ms`);
}

const StreamingBlotter: React.FC<StreamingBlotterProps> = ({
  domainObject,
  streamingUrl,
  maxRows: maxRowsProp,
  active = true,
  streamingService: streamingServiceProp,
  onFlush,
  persistState = true,
}) => {
  // The rows live outside React state (SPEC-0057): an event costs O(1) and renders nothing; once per
  // frame the grid gets what changed as one transaction and the counters are rendered once.
  const storeRef = useRef(new RowStore<any>(DEFAULT_MAX_STREAMING_ROWS));
  const eventCountRef = useRef(0);
  const lastEventTimeRef = useRef<number | null>(null);
  const framePendingRef = useRef(false);
  // The snapshot (SPEC-0057): the server's matching count from its end marker, and when this
  // subscription started, for the time until the snapshot is shown (AC-11).
  const snapshotTotalRef = useRef<number | null>(null);
  // Rows created on the server since the snapshot, for "Showing N of M" (AC-8).
  const newSinceSnapshotRef = useRef(0);
  const subscribeStartRef = useRef(0);
  const snapshotShownPendingRef = useRef(false);
  const snapshotQuietTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The quiet fallback showed the snapshot before its marker: later snapshot rows are late rows.
  const snapshotShownEarlyRef = useRef(false);
  const [view, setView] = useState({
    rowCount: 0, eventCount: 0, lastEventTime: null as number | null, pending: 0, total: null as number | null,
  });
  /** M in "Showing N of M": matching on the server at the snapshot, plus rows created since. */
  const matchingTotal = () => snapshotTotalRef.current === null ? null : snapshotTotalRef.current + newSinceSnapshotRef.current;
  // Held: the grid is not updated while the user paused it, or while its view is hidden (SPEC-0056).
  // Events keep going into the bounded store; on release one transaction catches up (SPEC-0057).
  const [paused, setPaused] = useState(false);
  const heldRef = useRef(false);
  const eventCountAtHoldRef = useRef(0);
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
  const [includeSnapshot, setIncludeSnapshot] = useState(true);
  // Rolling-window cap (SPEC-0054): resolved from config, bounded memory
  const [maxRows, setMaxRows] = useState(DEFAULT_MAX_STREAMING_ROWS);
  // Bumped on manual reconnect so the subscribe effect re-runs and re-subscribes (AC-7)
  const [reconnectTick, setReconnectTick] = useState(0);

  const gridRef = useRef<AgGridReact>(null);
  const gridApiRef = useRef<GridApi | null>(null);
  const subscriptionRef = useRef<StreamSubscription | null>(null);
  // SPEC-0056: re-subscribe when the shared connection comes back (see handleConnectionStateChange).
  const lastConnectionStateRef = useRef<StreamingConnectionState | undefined>(undefined);
  const needsResubscribeRef = useRef(false);
  const reconnectingRef = useRef(false);
  const streamingServiceRef = useRef<StreamingServiceLike | null>(null);
  const onFlushRef = useRef(onFlush);
  onFlushRef.current = onFlush;
  const connectionStateHandlerRef = useRef<((state: StreamingConnectionState) => void) | null>(null);
  
  const metamodelService = MetamodelService.getInstance();
  const columnConfigService = ColumnConfigService.getInstance();
  const stateService = BlotterStateService.getInstance();

  // The rolling-window cap (SPEC-0054) bounds the store; a lower cap evicts at once.
  useEffect(() => {
    storeRef.current.setCap(maxRows);
  }, [maxRows]);

  /**
   * Applies what changed since the last frame (SPEC-0057): one grid transaction, then one render
   * for the counters. Without a grid yet, the store keeps the delta until the grid is ready.
   */
  const flush = useCallback(() => {
    framePendingRef.current = false;
    const store = storeRef.current;
    if (heldRef.current) {
      // Paused: only the counters move. Hidden: nothing to show at all.
      if (activeRef.current) {
        setView({
          rowCount: store.size,
          eventCount: eventCountRef.current,
          lastEventTime: lastEventTimeRef.current,
          pending: eventCountRef.current - eventCountAtHoldRef.current,
          total: matchingTotal(),
        });
      }
      return;
    }
    const api = gridApiRef.current;
    if (api) {
      const delta = store.takeDelta();
      const changed = delta.add.length > 0 || delta.update.length > 0 || delta.remove.length > 0;
      // AG Grid returns nothing when it cannot apply a transaction (e.g. its module is not
      // registered): then nothing reached the grid, and the load harness must not count it.
      if (changed && !api.applyTransaction(delta)) {
        // The grid holds what it held: the store puts the delta back for the next flush.
        store.rejectLastDelta();
        console.error('[StreamingBlotter] The grid did not apply the transaction; are the AG Grid modules registered?');
      } else {
        onFlushRef.current?.(eventCountRef.current);
      }
      if (snapshotShownPendingRef.current) {
        snapshotShownPendingRef.current = false;
        recordSnapshotShown(domainObject, subscribeStartRef.current, store.size);
      }
    }
    setView({
      rowCount: store.size, eventCount: eventCountRef.current, lastEventTime: lastEventTimeRef.current,
      pending: 0, total: matchingTotal(),
    });
    // matchingTotal reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainObject]);

  /** At most one flush per frame, however many events arrive. A hidden blotter schedules none: it
   *  catches up in one flush when shown (the hold effect). */
  const requestFlush = useCallback(() => {
    if (heldRef.current && !activeRef.current) {
      return;
    }
    if (!framePendingRef.current) {
      framePendingRef.current = true;
      scheduleFrame(flush);
    }
  }, [flush]);

  /** A new subscription starts from no rows and no events. */
  const resetRows = useCallback(() => {
    storeRef.current.clear();
    eventCountRef.current = 0;
    lastEventTimeRef.current = null;
    snapshotTotalRef.current = null;
    newSinceSnapshotRef.current = 0;
    snapshotShownPendingRef.current = false;
    snapshotShownEarlyRef.current = false;
    if (snapshotQuietTimerRef.current !== null) {
      clearTimeout(snapshotQuietTimerRef.current);
      snapshotQuietTimerRef.current = null;
    }
    requestFlush();
  }, [requestFlush]);

  /**
   * The snapshot is over: its end marker arrived (with the server's matching count), or a live event
   * did, from a server without the marker. Its rows reach the grid in one transaction (AC-5).
   */
  const endSnapshot = useCallback((matching?: number) => {
    if (snapshotQuietTimerRef.current !== null) {
      clearTimeout(snapshotQuietTimerRef.current);
      snapshotQuietTimerRef.current = null;
    }
    // The marker's count is always taken, even after the quiet fallback already showed the snapshot.
    if (matching !== undefined) {
      snapshotTotalRef.current = matching;
    }
    const store = storeRef.current;
    if (!store.inSnapshot) {
      requestFlush();
      return;
    }
    store.endSnapshot();
    snapshotShownPendingRef.current = true;
    setLoading(false);
    requestFlush();
  }, [requestFlush]);

  // Get row ID for AG Grid (enables efficient updates): the row's business key
  const getRowId = useCallback((params: GetRowIdParams) => {
    return rowIdOf(domainObject, params.data);
  }, [domainObject]);

  // Initialize streaming service with config
  useEffect(() => {
    const initService = async () => {
      // Resolve streaming URL: explicit prop > backend config > default
      let wsUrl = streamingUrl;
      if (!wsUrl && !streamingServiceProp) {
        try {
          const config = await ConfigService.getConfig();
          wsUrl = config.streamingUrl || DEFAULT_STREAMING_URL;
        } catch (e) {
          console.warn('[StreamingBlotter] Failed to get config, using default URL');
          wsUrl = DEFAULT_STREAMING_URL;
        }
      }

      const service = streamingServiceProp ?? RSocketStreamingService.getInstance({ wsUrl });
      streamingServiceRef.current = service;

      // Resolve the rolling-window limit: explicit prop > backend config > default
      if (maxRowsProp !== undefined) {
        setMaxRows(maxRowsProp);
      } else {
        try {
          await ConfigService.getConfig();
          setMaxRows(getMaxStreamingRows());
        } catch (e) {
          console.warn('[StreamingBlotter] Failed to get config for maxStreamingRows, using default');
          setMaxRows(DEFAULT_MAX_STREAMING_ROWS);
        }
      }

      const handleConnectionStateChange = (state: StreamingConnectionState) => {
        const previous = lastConnectionStateRef.current;
        lastConnectionStateRef.current = state;
        setConnectionState(state);
        // The shared connection came back (another blotter's Connect, or a reconnect): a stream that
        // died with the old connection, or one the user disconnected here, subscribes again, so the
        // status never shows Connected over an idle blotter (SPEC-0056). A Connect in this blotter
        // re-subscribes by itself.
        const subscription = subscriptionRef.current;
        const streamDead = (subscription !== null && !subscription.isActive()) || needsResubscribeRef.current;
        if (state === 'connected' && previous !== undefined && previous !== 'connected' && streamDead
            && !reconnectingRef.current) {
          needsResubscribeRef.current = false;
          setReconnectTick(t => t + 1);
        }
        if (state === 'error') {
          setError('Connection to streaming server failed');
        } else if (state === 'connected') {
          setError(null);
        }
      };

      connectionStateHandlerRef.current = handleConnectionStateChange;
      service.addConnectionStateListener(handleConnectionStateChange);
      // The connection is shared: a blotter mounted after a tab or mode switch joins it as it is,
      // so take its current state now instead of waiting for a change that may never come (SPEC-0056).
      handleConnectionStateChange(service.getConnectionState());
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
  }, [streamingUrl, streamingServiceProp]);

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

  // Shown again: take the columns and filters the paging blotter may have saved meanwhile
  // (SPEC-0056). Only differing values are applied, so an unchanged filter does not re-subscribe.
  const activeRef = useRef(active);
  useEffect(() => {
    const wasActive = activeRef.current;
    activeRef.current = active;
    if (!active || wasActive || !initialized) return;
    const savedState = stateService.getState(domainObject);
    if (savedState && savedState.visibleColumns && savedState.visibleColumns.length > 0) {
      if (JSON.stringify(savedState.visibleColumns) !== JSON.stringify(visibleColumns)) {
        setVisibleColumns(savedState.visibleColumns);
      }
      if (!sameSavedFilters(filters, savedState.filters)) {
        setFilters(convertFiltersFromState(savedState.filters || {}));
      }
    }
    // Only the transition matters; the current columns and filters are compared, not watched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Hold the grid while paused or hidden; release it with one catch-up flush (SPEC-0057 AC-7).
  useEffect(() => {
    const wasHeld = heldRef.current;
    heldRef.current = paused || !active;
    if (!wasHeld && heldRef.current) {
      eventCountAtHoldRef.current = eventCountRef.current;
    } else if (wasHeld && !heldRef.current) {
      requestFlush();
    }
  }, [paused, active, requestFlush]);

  // Save state when it changes (use same key as REST blotter for shared state), only while shown:
  // a hidden blotter's copy may be stale (SPEC-0056).
  // Only filters and columns are written: the streaming blotter has no paging, so
  // writing pageSize/currentPage here would clobber the REST blotter's persisted values.
  useEffect(() => {
    if (initialized && activeRef.current && persistState) {
      const saved = stateService.getState(domainObject);
      stateService.saveState(domainObject, {
        filters: convertFiltersToState(filters),
        visibleColumns,
        sortModel: saved?.sortModel || [],
        pageSize: saved?.pageSize || 0,
        currentPage: saved?.currentPage || 0,
      });
    }
  }, [filters, visibleColumns, domainObject, initialized, persistState]);

  // Connect and subscribe when initialized, service ready, or filters change
  useEffect(() => {
    if (!initialized || !serviceReady || !streamingServiceRef.current) return;
    // This run subscribes, so a connect it makes is not "the connection came back" (SPEC-0056);
    // a run superseded while awaiting the connection does not subscribe at all.
    needsResubscribeRef.current = false;
    let cancelled = false;

    const connectAndSubscribe = async () => {
      const service = streamingServiceRef.current!;
      
      // Disconnect existing subscription
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }

      setLoading(true);
      resetRows();

      try {
        // Connect if not connected
        if (service.getConnectionState() !== 'connected') {
          await service.connect();
        }
        if (cancelled) return;

        // Create filter from UI filters. The server sends at most as many snapshot rows as the
        // blotter keeps, the newest (SPEC-0057).
        const streamFilter: StreamFilter = service.convertToStreamFilter(
          filters, includeSnapshot, storeRef.current.capacity);
        if (includeSnapshot) {
          storeRef.current.beginSnapshot();
          subscribeStartRef.current = performance.now();
          markPerformance(`oms:subscribe:${domainObject}`);
        }

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

        // With a snapshot, "Loading snapshot..." stays until its end marker.
        if (!includeSnapshot) {
          setLoading(false);
        }
      } catch (err: any) {
        if (cancelled) return;
        // Subscribe when the shared connection comes back (SPEC-0056).
        needsResubscribeRef.current = true;
        setError(err.message);
        setLoading(false);
      }
    };

    connectAndSubscribe();

    return () => {
      cancelled = true;
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }
    };
  }, [initialized, serviceReady, filters, includeSnapshot, domainObject, reconnectTick, resetRows]);

  /**
   * One row from the stream: a snapshot row is held back until the snapshot ends (SPEC-0057). A live
   * row created on the server since the snapshot (`isNewRow`) adds to M in "Showing N of M".
   */
  const takeRow = useCallback((isSnapshot: boolean, key: string, row: any, isNewRow: boolean) => {
    const store = storeRef.current;
    eventCountRef.current++;
    lastEventTimeRef.current = Date.now();
    if (isSnapshot && !store.inSnapshot && snapshotShownEarlyRef.current) {
      // A late snapshot row (see RowStore.putOldest): older than everything shown.
      store.putOldest(key, row);
      requestFlush();
      return;
    }
    if (isSnapshot && store.inSnapshot) {
      store.putSnapshot(key, row);
      // A server without the SNAPSHOT_END marker, in a quiet market, would leave the snapshot
      // unshown until the next live event: show it once no snapshot row has come for a while.
      if (snapshotQuietTimerRef.current !== null) {
        clearTimeout(snapshotQuietTimerRef.current);
      }
      snapshotQuietTimerRef.current = setTimeout(() => {
        snapshotShownEarlyRef.current = true;
        endSnapshot();
      }, SNAPSHOT_QUIET_MS);
      return;
    }
    if (store.inSnapshot) {
      endSnapshot();
    }
    if (isNewRow && !isSnapshot) {
      newSinceSnapshotRef.current++;
    }
    store.put(key, row);
    requestFlush();
  }, [requestFlush, endSnapshot]);

  const handleOrderEvent = useCallback((event: OrderEvent) => {
    if (event.eventType === 'SNAPSHOT_END') {
      endSnapshot(event.snapshotTotal);
      return;
    }
    const order = RSocketStreamingService.normalizeOrderEvent(event);
    const orderId = order.orderId || order.id;
    
    if (!orderId) {
      console.warn('[StreamingBlotter] Order event missing orderId:', event);
      return;
    }

    // Updated cells flash through the column default enableCellChangeFlash when the grid applies
    // the update, so there is no per-event flash.
    // An order's first event version is its creation (`OrderEventAppender`: version = txNr + 1).
    takeRow(event.eventType === 'SNAPSHOT', orderId, order, event.eventId === 1);
  }, [takeRow, endSnapshot]);

  const handleExecutionEvent = useCallback((event: ExecutionEvent) => {
    const execution = event.execution;

    if (event.eventType === 'SNAPSHOT_END') {
      endSnapshot(event.snapshotTotal);
      return;
    }
    if (!execution || !execution.execId || !execution.orderId) {
      console.warn('[StreamingBlotter] Execution event missing orderId or execId:', event);
      return;
    }

    // Keyed like the grid rows: execId is unique per order only
    // Every live fill is a new row: the server drops redeliveries and replays (SPEC-0019, SPEC-0057).
    takeRow(event.eventType === 'SNAPSHOT', rowIdOf('Execution', execution), execution, true);
  }, [takeRow, endSnapshot]);

  const handleStreamError = useCallback((error: Error) => {
    console.error('[StreamingBlotter] Stream error:', error);
    setError(error.message);
    setLoading(false);
  }, []);

  const handleStreamComplete = useCallback(() => {
    setLoading(false);
  }, []);

  const onGridReady = useCallback((params: GridReadyEvent) => {
    gridApiRef.current = params.api;
    // Columns fit the grid's width (autoSizeStrategy, SPEC-0058); auto-sizing here would size them
    // to the headers of a grid with no rows yet.
    // Rows that arrived before the grid existed
    flush();
  }, [flush]);

  const onRowDoubleClicked = useCallback((event: RowDoubleClickedEvent) => {
    setSelectedItem(event.data);
    setShowDetailModal(true);
  }, []);

  const handleApplyFilters = (newFilters: FilterCondition[]) => {
    setFilters(newFilters);
    setShowFilterBuilder(false);
  };

  const handleApplyColumns = (newColumns: string[]) => {
    // A live selection keeps the history-only columns of the saved choice in place (SPEC-0056).
    setVisibleColumns(mergeLiveSelection(domainObject, visibleColumns, newColumns));
    setShowColumnSelector(false);
  };

  const handleReconnect = async () => {
    if (streamingServiceRef.current) {
      reconnectingRef.current = true;
      streamingServiceRef.current.disconnect();
      resetRows();
      try {
        await streamingServiceRef.current.connect();
        // Re-subscribe: the subscribe effect re-runs on the tick change
        needsResubscribeRef.current = false;
        setReconnectTick(t => t + 1);
      } catch (err) {
        console.error('[StreamingBlotter] Reconnect failed:', err);
      } finally {
        reconnectingRef.current = false;
      }
    }
  };

  const handleDisconnect = () => {
    if (subscriptionRef.current) {
      subscriptionRef.current.unsubscribe();
      subscriptionRef.current = null;
    }
    // Disconnect closes the shared connection; when any blotter connects it again, this one
    // subscribes again too (SPEC-0056).
    needsResubscribeRef.current = true;
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

  // The same column definitions until the columns change (SPEC-0057): the blotter renders once per
  // frame, and new definitions would make AG Grid rebuild its columns every frame, costing frame
  // time and memory.
  const visibleColumnsKey = visibleColumns.join(',');
  const columnDefs = useMemo(
    () => (initialized
      ? columnConfigService.getColumnConfig(domainObject, splitColumns(domainObject, visibleColumns).live)
      : []),
    // visibleColumnsKey stands for visibleColumns; the service is a singleton.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [initialized, domainObject, visibleColumnsKey]
  );

  // The same grid element until one of its inputs changes (SPEC-0057 AC-9): the counters render once
  // per frame, and React skips an identical element, so those renders never reach AG Grid. Row
  // animation is off: under churn every eviction would animate every row below it.
  const grid = useMemo(() => (
    <AgGridReact
      ref={gridRef}
      theme={omsGridTheme}
      rowData={NO_ROWS}
      columnDefs={columnDefs}
      getRowId={getRowId}
      defaultColDef={DEFAULT_COL_DEF}
      autoSizeStrategy={FIT_COLUMNS_TO_WIDTH}
      onGridSizeChanged={fitColumnsOnResize}
      onNewColumnsLoaded={fitColumnsOnResize}
      animateRows={false}
      onGridReady={onGridReady}
      onRowDoubleClicked={onRowDoubleClicked}
    />
  ), [columnDefs, getRowId, onGridReady, onRowDoubleClicked]);

  if (!initialized) {
    return (
      <div className="blotter-container">
        <div className="loading-overlay">Loading metadata...</div>
      </div>
    );
  }

  // Live mode shows only the columns the stream can fill; the others stay saved for History mode
  // and are named in a note (SPEC-0056).
  const { live: liveColumns, historyOnly } = splitColumns(domainObject, visibleColumns);
  const metadata = metamodelService.getMetamodel(domainObject);
  const historyOnlyNames = historyOnly.map(name => metadata.fields.find(f => f.name === name)?.displayName ?? name);

  return (
    <div className="blotter-container streaming-blotter">
      {/* Toolbar */}
      <div className="blotter-toolbar">
        <div className="toolbar-left">
          <h2>{metadata.displayName}</h2>
          <span className="record-count">{view.rowCount} records</span>
          <span className={`streaming-status ${getConnectionStatusClass()}`}>
            <span className="status-dot" aria-hidden="true" />
            {connectionState}
          </span>
        </div>
        <div className="toolbar-right">
          <button
            onClick={() => setShowFilterBuilder(true)}
            className={filters.length > 0 ? 'filter-active' : ''}
          >
            <Icon name="filter" />
            Filters {filters.length > 0 && <span className="filter-badge">{filters.length}</span>}
          </button>
          <button onClick={() => setShowColumnSelector(true)}><Icon name="columns" />Columns</button>
          <button onClick={handleAutoSize}><Icon name="autosize" />Auto-Size</button>
          <button
            onClick={() => setPaused(p => !p)}
            className={paused ? 'resume-button' : 'pause-button'}
            aria-pressed={paused}
          >
            <Icon name={paused ? 'play' : 'pause'} />
            {paused ? 'Resume' : 'Pause'}
          </button>

          {connectionState === 'connected' ? (
            <button onClick={handleDisconnect} className="disconnect-button">
              <Icon name="disconnect" />
              Disconnect
            </button>
          ) : (
            <button onClick={handleReconnect} className="connect-button">
              <Icon name="connect" />
              Connect
            </button>
          )}
          
          <label className="toolbar-toggle snapshot-toggle">
            <input
              type="checkbox"
              checked={includeSnapshot}
              onChange={(e) => setIncludeSnapshot(e.target.checked)}
            />
            Include Snapshot
          </label>
        </div>
      </div>

      {/* Streaming Info Bar */}
      <div className="streaming-info-bar">
        <span className="event-count">Events: {view.eventCount}</span>
        <span className="showing-count">
          Showing {view.rowCount.toLocaleString('en-US')}
          {view.total !== null && ` of ${view.total.toLocaleString('en-US')}`}
        </span>
        {paused && (
          <span className="paused-note">Paused — {view.pending.toLocaleString('en-US')} updates pending</span>
        )}
        {historyOnly.length > 0 && (
          <span className="history-only-note">History only: {historyOnlyNames.join(', ')}</span>
        )}
        {view.lastEventTime !== null && (
          <span className="last-event">
            Last event: {new Date(view.lastEventTime).toLocaleTimeString()}
          </span>
        )}
        {loading && <span className="loading-indicator">Loading snapshot...</span>}
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
        {grid}
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
          currentColumns={liveColumns}
          availableFields={streamedFieldsOf(domainObject)}
          onApply={handleApplyColumns}
          onClose={() => setShowColumnSelector(false)}
        />
      )}

      {showDetailModal && selectedItem && (
        <DetailModal
          data={selectedItem}
          title={`${domainObject} details`}
          domainObject={domainObject}
          onClose={() => setShowDetailModal(false)}
        />
      )}
    </div>
  );
};

export default StreamingBlotter;
