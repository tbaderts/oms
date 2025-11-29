// Blotter.tsx - Core data grid component with AG Grid integration
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { GridApi, GridReadyEvent, FilterChangedEvent, SortChangedEvent, RowDoubleClickedEvent } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import { DomainObjectType, FilterCondition } from '../types/types';
import { OMSApiService } from '../services/OMSApiService';
import { ColumnConfigService } from '../services/ColumnConfigService';
import { BlotterStateService } from '../services/BlotterStateService';
import { MetamodelService } from '../services/MetamodelService';
import FilterBuilder from './FilterBuilder';
import ColumnSelector from './ColumnSelector';
import DetailModal from './DetailModal';
import './Blotter.scss';

interface BlotterProps {
  domainObject: DomainObjectType;
  pageSize?: number;
}

const Blotter: React.FC<BlotterProps> = ({ domainObject, pageSize = 100 }) => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
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
        console.log('[Blotter] initializeBlotter - Metadata fetched:', metadata);
        console.log('[Blotter] initializeBlotter - Default columns:', metadata.defaultColumns);

        // Restore saved state or use defaults
        const savedState = stateService.getState(domainObject);
        console.log('[Blotter] initializeBlotter - Saved state:', savedState);
        
        if (savedState && savedState.visibleColumns && savedState.visibleColumns.length > 0) {
          console.log('[Blotter] initializeBlotter - Restoring saved state');
          setFilters(convertFiltersFromState(savedState.filters));
          setVisibleColumns(savedState.visibleColumns);
          setSortModel(savedState.sortModel);
          setCurrentPage(savedState.currentPage);
        } else {
          console.log('[Blotter] initializeBlotter - Using default columns:', metadata.defaultColumns);
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

  // Save state whenever it changes
  useEffect(() => {
    stateService.saveState(domainObject, {
      filters: convertFiltersToState(filters),
      visibleColumns,
      sortModel,
      pageSize,
      currentPage,
    });
  }, [filters, visibleColumns, sortModel, currentPage, pageSize, domainObject]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadData();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, filters, sortModel, currentPage]);

  // Reload data when filters, sort, or page changes (only after initialization)
  useEffect(() => {
    if (initialized) {
      loadData();
    }
  }, [initialized, filters, sortModel, currentPage]);

  const loadData = useCallback(async () => {
    console.log('[Blotter] loadData - Starting load for:', domainObject);
    console.log('[Blotter] loadData - Current filters:', filters);
    console.log('[Blotter] loadData - Current sortModel:', sortModel);
    console.log('[Blotter] loadData - Current page:', currentPage);
    console.log('[Blotter] loadData - Page size:', pageSize);
    
    setLoading(true);
    setError(null);

    try {
      const omsApiService = await OMSApiService.getInstance();
      console.log('[Blotter] loadData - Got API service instance');
      
      const sort = sortModel.length > 0
        ? { field: sortModel[0].colId, direction: sortModel[0].sort }
        : undefined;
      console.log('[Blotter] loadData - Computed sort:', sort);

      let response;
      if (domainObject === 'Order') {
        console.log('[Blotter] loadData - Calling getOrders...');
        response = await omsApiService.getOrders(filters, sort, currentPage - 1, pageSize);
        console.log('[Blotter] loadData - getOrders response:', response);
      } else if (domainObject === 'Execution') {
        console.log('[Blotter] loadData - Calling getExecutions...');
        response = await omsApiService.getExecutions(filters, sort, currentPage - 1, pageSize);
        console.log('[Blotter] loadData - getExecutions response:', response);
      } else {
        throw new Error(`Unsupported domain object: ${domainObject}`);
      }

      console.log('[Blotter] loadData - Response content:', response.content);
      console.log('[Blotter] loadData - Response page metadata:', response.page);
      console.log('[Blotter] loadData - Response totalElements:', response.page?.totalElements);
      console.log('[Blotter] loadData - Setting data with', response.content?.length, 'items');
      console.log('[Blotter] loadData - First order data:', response.content?.[0]);
      console.log('[Blotter] loadData - First order keys:', response.content?.[0] ? Object.keys(response.content[0]) : 'no data');
      
      setData(response.content);
      setTotalCount(response.page?.totalElements || 0);
      console.log('[Blotter] loadData - Data set successfully');
    } catch (err: any) {
      console.error('[Blotter] loadData - Error caught:', err);
      console.error('[Blotter] loadData - Error message:', err.message);
      console.error('[Blotter] loadData - Error stack:', err.stack);
      setError(err.message);
    } finally {
      setLoading(false);
      console.log('[Blotter] loadData - Loading complete');
    }
  }, [domainObject, filters, sortModel, currentPage, pageSize]);

  const onGridReady = (params: GridReadyEvent) => {
    gridApiRef.current = params.api;
    // Auto-size columns to fit content
    params.api.autoSizeAllColumns();
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

  const convertFiltersToState = (filters: FilterCondition[]): { [key: string]: any } => {
    const state: { [key: string]: any } = {};
    filters.forEach(f => {
      state[`${f.field}${f.operation}`] = f.value;
    });
    return state;
  };

  const convertFiltersFromState = (state: { [key: string]: any }): FilterCondition[] => {
    return Object.entries(state).map(([key, value]) => {
      const match = key.match(/^(.+?)(__\w+)?$/);
      return {
        field: match![1],
        operation: match![2] || '',
        value,
      };
    });
  };

  // Don't render until metadata is loaded
  if (!initialized) {
    return (
      <div className="blotter-container">
        <div className="loading-overlay">Loading metadata...</div>
      </div>
    );
  }

  const columnDefs = columnConfigService.getColumnConfig(domainObject, visibleColumns);
  const metadata = metamodelService.getMetamodel(domainObject);

  console.log('[Blotter] Column defs:', columnDefs);
  console.log('[Blotter] Visible columns:', visibleColumns);
  console.log('[Blotter] Metadata:', metadata);
  console.log('[Blotter] Current data length:', data.length);
  console.log('[Blotter] Current data:', data);

  return (
    <div className="blotter-container">
      {/* Toolbar */}
      <div className="blotter-toolbar">
        <div className="toolbar-left">
          <span className="toolbar-icon">📋</span>
          <h2>{metadata.displayName}</h2>
          <span className="record-count">{totalCount} records</span>
        </div>
        <div className="toolbar-right">
          <button 
            onClick={() => setShowFilterBuilder(true)}
            className={filters.length > 0 ? 'filter-active' : ''}
          >
            🔍 Filters {filters.length > 0 && <span className="filter-badge">{filters.length}</span>}
          </button>
          <button onClick={() => setShowColumnSelector(true)}>📊 Columns</button>
          <button onClick={handleRefresh}>🔄 Refresh</button>
          <button onClick={handleAutoSize}>↔️ Auto-Size</button>
          <label>
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
      <div className="ag-theme-quartz blotter-grid">
        {loading && <div className="loading-overlay">Loading...</div>}
        <AgGridReact
          ref={gridRef}
          rowData={data}
          columnDefs={columnDefs}
          defaultColDef={{
            sortable: true,
            filter: true,
            resizable: true,
          }}
          rowHeight={28}
          headerHeight={32}
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
          <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>
            ⏮ First
          </button>
          <button onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1}>
            ◀ Prev
          </button>
          <span className="page-indicator">{currentPage}</span>
          <button
            onClick={() => setCurrentPage(p => p + 1)}
            disabled={currentPage >= Math.ceil(totalCount / pageSize)}
          >
            Next ▶
          </button>
          <button
            onClick={() => setCurrentPage(Math.ceil(totalCount / pageSize))}
            disabled={currentPage >= Math.ceil(totalCount / pageSize)}
          >
            Last ⏭
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
          title={metadata.displayName}
          onClose={() => setShowDetailModal(false)}
        />
      )}
    </div>
  );
};

export default Blotter;
