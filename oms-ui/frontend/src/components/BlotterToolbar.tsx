import React from 'react';
import Icon from './icons/Icon';

interface BlotterToolbarProps {
  mode: 'live' | 'history';
  /** The blotter's title, e.g. "Orders". */
  title: string;
  recordCount: number;
  /** Active filters, shown as a badge on the Filters button. */
  filterCount: number;
  onFilters: () => void;
  onColumns: () => void;
  onAutoSize: () => void;
  /** Shown after the record count (Live: the connection status). */
  status?: React.ReactNode;
  /** Mode-specific buttons after Auto-Size (Live: Pause, Connect; History: Refresh, Auto-refresh). */
  actions?: React.ReactNode;
}

/** The toolbar of both blotters (SPEC-0059): what they share, plus a slot for each mode's own actions. */
const BlotterToolbar: React.FC<BlotterToolbarProps> = ({
  mode, title, recordCount, filterCount, onFilters, onColumns, onAutoSize, status, actions,
}) => (
  <div className="blotter-toolbar" data-testid="blotter-toolbar" data-mode={mode}>
    <div className="toolbar-left">
      <h2>{title}</h2>
      <span className="record-count">{recordCount.toLocaleString('en-US')} records</span>
      {status}
    </div>
    <div className="toolbar-right">
      <button onClick={onFilters} className={filterCount > 0 ? 'filter-active' : ''} title="Filters (F)" aria-keyshortcuts="F">
        <Icon name="filter" />
        Filters {filterCount > 0 && <span className="filter-badge">{filterCount}</span>}
      </button>
      <button onClick={onColumns} title="Columns (C)" aria-keyshortcuts="C"><Icon name="columns" />Columns</button>
      <button onClick={onAutoSize} title="Auto-size columns"><Icon name="autosize" />Auto-Size</button>
      {actions}
    </div>
  </div>
);

export default BlotterToolbar;
