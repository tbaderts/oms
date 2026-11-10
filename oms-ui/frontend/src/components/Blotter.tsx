// Blotter.tsx - Core data grid component with AG Grid integration
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import '../theme/agGridModules';
import { GridApi, GridReadyEvent, FilterChangedEvent, SortChangedEvent, RowDoubleClickedEvent } from 'ag-grid-community';
import { omsGridTheme } from '../theme/agGridTheme';
import { FIT_COLUMNS_TO_WIDTH, fitColumnsOnResize } from '../theme/gridSizing';
import Icon from './icons/Icon';
import { DomainObjectType, FilterCondition } from '../types/types';
import { OMSApiService } from '../services/OMSApiService';
import { ColumnConfigService } from '../services/ColumnConfigService';
import { BlotterStateService } from '../services/BlotterStateService';
import { MetamodelService } from '../services/MetamodelService';
import { convertFiltersToState, convertFiltersFromState, sameSavedFilters } from '../services/filterUtils';
import { rowIdOf } from '../services/rowId';
import FilterBuilder from './FilterBuilder';
import ColumnSelector from './ColumnSelector';
import DetailModal from './DetailModal';
import './Blotter.scss';

interface BlotterProps {
  domainObject: DomainObjectType;
  pageSize?: number;
  /**
   * Whether this blotter's view is the one shown (SPEC-0056). Views are kept mounted while hidden;
   * a hidden blotter neither saves its state nor auto-refreshes, and re-reads the shared saved
   * columns and filters when it is shown again, since the live blotter may have changed them.
   */
  active?: boolean;
}

// Page-size options for the paging-mode selector; 500 is the query API maximum.
const PAGE_SIZE_OPTIONS = [50, 100, 250, 500];

/** One object for every render (SPEC-0058), like the live blotter's. */
const DEFAULT_COL_DEF = { sortable: true, filter: true, resizable: true };

const Blotter: React.FC<BlotterProps> = ({ domainObject, pageSize: pageSizeProp = 100, active = true }) => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(pageSizeProp);
  const [filters, setFilters] = useState<FilterCondition[]>([]);
  const [sortModel, setSortModel] = useState<any[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [showFilterBuilder, setShowFilterBuilder] = useState(false);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const gridRef = useRef<AgGridReact>(null);
  const gridApiRef = useRef<GridApi | null>(null);
  const metamodelService = MetamodelService.getInstance();
  const columnConfigService = ColumnConfigService.getInstance();
  const stateService = BlotterStateService.getInstance();

  // Initialize metadata and restore state
  useEffect(() => {
    const initializeBlotter = async () => {
      try {
        // Fetch metadata
        await metamodelService.getMetamodelAsync(domainObject);
        const metadata = metamodelService.getMetamodel(domainObject);

        // Restore saved state or use defaults
        const savedState = stateService.getState(domainObject);
        
        if (savedState && savedState.visibleColumns && savedState.visibleColumns.length > 0) {
          setFilters(convertFiltersFromState(savedState.filters));
          setVisibleColumns(savedState.visibleColumns);
          setSortModel(savedState.sortModel);
          // The live blotter saves no paging (0): start on the first page then (SPEC-0056).
          setCurrentPage(savedState.currentPage > 0 ? savedState.currentPage : 1);
          if (savedState.pageSize > 0) {
            setPageSize(savedState.pageSize);
          }
        } else {
          setVisibleColumns(metadata.defaultColumns);
        }
        // Mark as initialized - data loading useEffect will trigger
        setInitialized(true);
      } catch (err: any) {
        setError(err.message);
      }
    };

    initializeBlotter();
  }, [domainObject]);

  // Shown again: take the columns and filters the other mode may have saved meanwhile (SPEC-0056).
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

  // Save state whenever it changes, only while shown: a hidden blotter's copy may be stale. Not
  // before the saved state was read: the empty initial state would overwrite it (SPEC-0056).
  useEffect(() => {
    if (!initialized || !activeRef.current) return;
    stateService.saveState(domainObject, {
      filters: convertFiltersToState(filters),
      visibleColumns,
      sortModel,
      pageSize,
      currentPage,
    });
  }, [filters, visibleColumns, sortModel, currentPage, pageSize, domainObject, initialized]);

  // Auto-refresh, only while shown (SPEC-0056)
  useEffect(() => {
    if (!autoRefresh || !active) return;

    const interval = setInterval(() => {
      loadData();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, active, filters, sortModel, currentPage]);

  // Reload data when filters, sort, page, or page size changes (only after initialization)
  useEffect(() => {
    if (initialized) {
      loadData();
    }
  }, [initialized, filters, sortModel, currentPage, pageSize]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const omsApiService = await OMSApiService.getInstance();
      
      const sort = sortModel.length > 0
        ? { field: sortModel[0].colId, direction: sortModel[0].sort }
        : undefined;

      let response;
      if (domainObject === 'Order') {
        response = await omsApiService.getOrders(filters, sort, currentPage - 1, pageSize);
      } else if (domainObject === 'Execution') {
        response = await omsApiService.getExecutions(filters, sort, currentPage - 1, pageSize);
      } else {
        throw new Error(`Unsupported domain object: ${domainObject}`);
      }

      setData(response.content);
      setTotalCount(response.page?.totalElements || 0);
    } catch (err: any) {
      console.error('[Blotter] loadData - Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [domainObject, filters, sortModel, currentPage, pageSize]);

  const onGridReady = (params: GridReadyEvent) => {
    gridApiRef.current = params.api;
    // Columns fit the grid's width (autoSizeStrategy); Auto-Size fits them to their content on demand.
  };

  const onFilterChanged = (event: FilterChangedEvent) => {
    // Convert AG Grid filter model to OMS filter format
    const filterModel = event.api.getFilterModel();
    const omsFilters: FilterCondition[] = [];

    Object.entries(filterModel).forEach(([field, filter]: [string, any]) => {
      if (filter.type === 'contains') {
        omsFilters.push({ field, operation: '__like', value: `%${filter.filter}%` });
      } else if (filter.type === 'equals') {
        omsFilters.push({ field, operation: '', value: filter.filter });
      }
    });

    setFilters(omsFilters);
  };

  const onSortChanged = (event: SortChangedEvent) => {
    const sortModel = event.api.getColumnState()
      .filter(col => col.sort != null)
      .map(col => ({ colId: col.colId!, sort: col.sort! }));
    setSortModel(sortModel);
  };

  const onRowDoubleClicked = (event: RowDoubleClickedEvent) => {
    setSelectedItem(event.data);
    setShowDetailModal(true);
  };

  const handleApplyFilters = (newFilters: FilterCondition[]) => {
    setFilters(newFilters);
    setCurrentPage(1); // Reset to first page
    setShowFilterBuilder(false);
    // loadData will be triggered by useEffect when filters state updates
  };

  const handleApplyColumns = (newColumns: string[]) => {
    setVisibleColumns(newColumns);
    setShowColumnSelector(false);
  };

  const handleRefresh = () => {
    loadData();
  };

  const handleAutoSize = () => {
    gridApiRef.current?.autoSizeAllColumns();
  };

  // The same definitions until the columns change (SPEC-0058): new ones on a render would reset the
  // columns to their metamodel widths after they were fitted to the panel.
  const visibleColumnsKey = visibleColumns.join(',');
  const columnDefs = useMemo(
    () => (initialized ? columnConfigService.getColumnConfig(domainObject, visibleColumns) : []),
    // visibleColumnsKey stands for visibleColumns; the service is a singleton.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [initialized, domainObject, visibleColumnsKey]
  );

  // Don't render until metadata is loaded
  if (!initialized) {
    return (
      <div className="blotter-container">
        <div className="loading-overlay">Loading metadata...</div>
      </div>
    );
  }

  const metadata = metamodelService.getMetamodel(domainObject);

  return (
    <div className="blotter-container">
      {/* Toolbar */}
      <div className="blotter-toolbar">
        <div className="toolbar-left">
          <h2>{metadata.displayName}</h2>
          <span className="record-count">{totalCount} records</span>
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
          <button onClick={handleRefresh}><Icon name="refresh" />Refresh</button>
          <button onClick={handleAutoSize}><Icon name="autosize" />Auto-Size</button>
          <label className="toolbar-toggle">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
        </div>
      </div>

      {/* Error Display */}
      {error && <div className="error-message">{error}</div>}

      {/* AG Grid */}
      <div className="blotter-grid">
        {loading && <div className="loading-overlay">Loading...</div>}
        <AgGridReact
          ref={gridRef}
          theme={omsGridTheme}
          rowData={data}
          columnDefs={columnDefs}
          getRowId={(params) => rowIdOf(domainObject, params.data)}
          defaultColDef={DEFAULT_COL_DEF}
          autoSizeStrategy={FIT_COLUMNS_TO_WIDTH}
          onGridSizeChanged={fitColumnsOnResize}
          onNewColumnsLoaded={fitColumnsOnResize}
          pagination={false}
          onGridReady={onGridReady}
          onFilterChanged={onFilterChanged}
          onSortChanged={onSortChanged}
          onRowDoubleClicked={onRowDoubleClicked}
        />
      </div>

      {/* Pagination */}
      <div className="blotter-pagination">
        <span className="pagination-info">
          Page <span className="current-page">{currentPage}</span> of {Math.ceil(totalCount / pageSize)} ({totalCount} records)
        </span>
        <div className="pagination-controls">
          <label className="page-size-selector">
            Rows per page
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
            >
              {PAGE_SIZE_OPTIONS.map(size => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
          <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>
            First
          </button>
          <button onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1}>
            Prev
          </button>
          <span className="page-indicator">{currentPage}</span>
          <button
            onClick={() => setCurrentPage(p => p + 1)}
            disabled={currentPage >= Math.ceil(totalCount / pageSize)}
          >
            Next
          </button>
          <button
            onClick={() => setCurrentPage(Math.ceil(totalCount / pageSize))}
            disabled={currentPage >= Math.ceil(totalCount / pageSize)}
          >
            Last
          </button>
        </div>
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
          title={`${domainObject} details`}
          domainObject={domainObject}
          onClose={() => setShowDetailModal(false)}
        />
      )}
    </div>
  );
};

export default Blotter;
