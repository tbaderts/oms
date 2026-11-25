// DetailPanel.tsx - Well-organized detail panel for viewing an order or an execution
import React, { useState } from 'react';
import { dateTimeService } from '../services/DateTimeService';
import Icon, { IconName } from './icons/Icon';
import EnumCellRenderer from './EnumCellRenderer';
import { execTypeLabel, formatNumber, formatPrice } from '../services/fieldFormat';
import { DomainObjectType } from '../types/types';
import { enumBadge, formatFieldValue } from './FieldValue';
import './DetailPanel.scss';

interface DetailPanelProps {
  data: any;
  /** Whose metamodel labels the badges show (SPEC-0058); without it a badge shows the raw value. */
  domainObject?: DomainObjectType;
  columns?: string[];
}

type FieldGroups = Record<string, { title: string; fields: string[]; icon: IconName }>;

// Field groupings for organized display of an order (and the default layout)
const orderFieldGroups: FieldGroups = {
  identification: {
    title: 'Identification',
    icon: 'id',
    fields: ['orderId', 'clOrdId', 'origClOrdId', 'parentOrderId', 'rootOrderId', 'sessionId'],
  },
  instrument: {
    title: 'Instrument',
    icon: 'instrument',
    fields: ['symbol', 'securityId', 'securityIdSource', 'securityDesc', 'securityType', 'securityExchange'],
  },
  orderDetails: {
    title: 'Order Details',
    icon: 'order',
    fields: ['side', 'ordType', 'orderQty', 'price', 'stopPx', 'cashOrderQty', 'timeInForce', 'expireTime'],
  },
  execution: {
    title: 'Execution',
    icon: 'execution',
    fields: ['execId', 'execType', 'lastQty', 'lastPx', 'avgPx', 'cumQty', 'leavesQty', 'placeQty', 'allocQty', 'exDestination', 'handlInst', 'execInst'],
  },
  status: {
    title: 'Status',
    icon: 'status',
    fields: ['state', 'cancelState', 'rejectReason', 'positionEffect'],
  },
  timing: {
    title: 'Timing',
    icon: 'time',
    fields: ['sendingTime', 'transactTime', 'tifTimestamp'],
  },
  settlement: {
    title: 'Settlement',
    icon: 'settlement',
    fields: ['account', 'settlCurrency', 'priceType'],
  },
  derivatives: {
    title: 'Derivatives',
    icon: 'derivative',
    fields: ['maturityMonthYear', 'strikePrice', 'putOrCall', 'underlyingSecurityType', 'leg'],
  },
  other: {
    title: 'Other',
    icon: 'misc',
    fields: ['id', 'tx', 'txNr', 'text'],
  },
};

// An execution shows only what the fill itself carries. The order fields some execution rows also
// hold (symbol, side, price, account, ... as of the fill) are left out: they belong to the order.
const executionFieldGroups: FieldGroups = {
  execution: {
    title: 'Execution',
    icon: 'execution',
    fields: ['execId', 'execType', 'lastQty', 'lastPx', 'lastMkt', 'lastCapacity'],
  },
  // The FIX Instrument block the venue reported on the fill (SPEC-0069)
  instrument: {
    title: 'Instrument',
    icon: 'instrument',
    fields: ['symbol', 'securityId', 'securityIdSource'],
  },
  orderProgress: {
    title: 'Order Progress',
    icon: 'status',
    fields: ['cumQty', 'leavesQty', 'avgPx'],
  },
  identification: {
    title: 'Identification',
    icon: 'id',
    fields: ['orderId', 'rootOrderId', 'orderVersion'],
  },
  timing: {
    title: 'Timing',
    icon: 'time',
    fields: ['transactTime', 'tradeDate'],
  },
  other: {
    title: 'Other',
    icon: 'misc',
    fields: ['id'],
  },
};

interface Layout {
  groups: FieldGroups;
  expanded: string[];
  /** Fields left out entirely, not even under Additional Fields. */
  hidden: Set<string>;
}

const defaultLayout: Layout = {
  groups: orderFieldGroups,
  expanded: ['identification', 'instrument', 'orderDetails', 'status'],
  hidden: new Set<string>(),
};

const layouts: Partial<Record<DomainObjectType, Layout>> = {
  Execution: {
    groups: executionFieldGroups,
    expanded: ['execution', 'instrument', 'orderProgress', 'identification', 'timing'],
    // Order fields an execution row may carry, except those the fill reports itself
    hidden: new Set(
      Object.values(orderFieldGroups)
        .flatMap(g => g.fields)
        .filter(f => !Object.values(executionFieldGroups).some(g => g.fields.includes(f)))
    ),
  },
};

// Display names for fields
const fieldDisplayNames: Record<string, string> = {
  orderId: 'Order ID',
  clOrdId: 'Client Order ID',
  origClOrdId: 'Original Client Order ID',
  parentOrderId: 'Parent Order ID',
  rootOrderId: 'Root Order ID',
  sessionId: 'Session ID',
  symbol: 'Symbol',
  securityId: 'Security ID',
  securityIdSource: 'Security ID Source',
  securityDesc: 'Description',
  securityType: 'Security Type',
  securityExchange: 'Exchange',
  side: 'Side',
  ordType: 'Order Type',
  orderQty: 'Order Quantity',
  price: 'Price',
  stopPx: 'Stop Price',
  cashOrderQty: 'Cash Order Qty',
  timeInForce: 'Time In Force',
  expireTime: 'Expire Time',
  cumQty: 'Cumulative Qty',
  leavesQty: 'Leaves Qty',
  placeQty: 'Place Qty',
  allocQty: 'Alloc Qty',
  exDestination: 'Destination',
  handlInst: 'Handling Instruction',
  execInst: 'Execution Instruction',
  state: 'State',
  cancelState: 'Cancel State',
  rejectReason: 'Reject Reason',
  positionEffect: 'Position Effect',
  sendingTime: 'Sending Time',
  transactTime: 'Transaction Time',
  tifTimestamp: 'TIF Timestamp',
  account: 'Account',
  settlCurrency: 'Settlement Currency',
  priceType: 'Price Type',
  maturityMonthYear: 'Maturity',
  strikePrice: 'Strike Price',
  putOrCall: 'Put/Call',
  underlyingSecurityType: 'Underlying Type',
  leg: 'Leg',
  execId: 'Exec ID',
  execType: 'Exec Type',
  lastQty: 'Last Qty',
  lastPx: 'Last Px',
  avgPx: 'Avg Px',
  lastMkt: 'Last Market',
  lastCapacity: 'Last Capacity',
  orderVersion: 'Order Version',
  tradeDate: 'Trade Date',
  id: 'Internal ID',
  tx: 'Transaction',
  txNr: 'Transaction Number',
  text: 'Text',
};

const DetailPanel: React.FC<DetailPanelProps> = ({ data, domainObject }) => {
  const layout = (domainObject && layouts[domainObject]) || defaultLayout;
  const fieldGroups = layout.groups;

  /** A badge exactly as the grid draws it: the label, in the value's tone. */
  const badge = (field: string, value: string) => enumBadge(domainObject, field, value);

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    () => new Set(layout.expanded)
  );

  if (!data) {
    return (
      <div className="detail-panel">
        <p className="no-data">No {domainObject === 'Execution' ? 'execution' : 'order'} selected</p>
      </div>
    );
  }

  const toggleSection = (sectionKey: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionKey)) {
      newExpanded.delete(sectionKey);
    } else {
      newExpanded.add(sectionKey);
    }
    setExpandedSections(newExpanded);
  };

  const formatValue = (key: string, value: any): React.JSX.Element | string =>
    formatFieldValue(key, value, domainObject);

  const getFieldsInGroup = (groupKey: string): Array<{ key: string; value: any }> => {
    const group = fieldGroups[groupKey];
    if (!group) return [];

    return group.fields
      .filter(field => data.hasOwnProperty(field))
      .map(field => ({ key: field, value: data[field] }));
  };

  const getUnassignedFields = (): Array<{ key: string; value: any }> => {
    const assignedFields = new Set(
      Object.values(fieldGroups).flatMap(group => group.fields)
    );
    return Object.keys(data)
      .filter(key => !assignedFields.has(key) && !layout.hidden.has(key))
      .map(key => ({ key, value: data[key] }));
  };

  const renderSection = (groupKey: string) => {
    const group = fieldGroups[groupKey];
    const fields = getFieldsInGroup(groupKey);
    
    // Don't render empty sections (unless they have some relevant data)
    const hasNonNullValues = fields.some(f => f.value !== null && f.value !== undefined);
    if (fields.length === 0 || !hasNonNullValues) return null;

    const isExpanded = expandedSections.has(groupKey);

    return (
      <div key={groupKey} className={`detail-section ${isExpanded ? 'expanded' : 'collapsed'}`}>
        <div className="section-header" onClick={() => toggleSection(groupKey)}>
          <Icon name={group.icon} className="section-icon" />
          <h4>{group.title}</h4>
          <Icon name="chevron" className={`section-toggle${isExpanded ? ' open' : ''}`} />
        </div>
        {isExpanded && (
          <div className="section-content">
            <div className="field-grid">
              {fields.map(({ key, value }) => (
                <div key={key} className="field-row">
                  <span className="field-label">{fieldDisplayNames[key] || key}</span>
                  <span className="field-value">{formatValue(key, value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const summaryItem = (label: string, value: React.ReactNode) => (
    <div className="summary-item">
      <span className="summary-label">{label}</span>
      <span className="summary-value">{value ?? '—'}</span>
    </div>
  );

  const num = (value: any, price = false) =>
    typeof value === 'number' ? (price ? formatPrice(value) : formatNumber(value)) : value;

  // The fill at a glance: what traded at what price, and where that leaves the order
  const renderExecutionHeader = () => {
    const fill = data.lastQty != null && data.lastPx != null
      ? `${num(data.lastQty)} @ ${num(data.lastPx, true)}`
      : data.execId || '—';
    return (
      <div className="detail-header">
        <div className="header-main">
          <div className="header-symbol">
            <span className="symbol">{fill}</span>
            <span className="security-desc">{data.lastMkt ? `on ${data.lastMkt}` : ''}</span>
          </div>
          <div className="header-badges">
            {data.execType && <EnumCellRenderer value={data.execType} valueFormatted={execTypeLabel(data.execType)} />}
          </div>
        </div>
        <div className="header-summary">
          {summaryItem('Cumulative Qty', num(data.cumQty))}
          {summaryItem('Leaves Qty', num(data.leavesQty))}
          {summaryItem('Avg Px', num(data.avgPx, true))}
          {summaryItem('Transact Time', data.transactTime ? dateTimeService.formatForDisplay(data.transactTime) || data.transactTime : null)}
        </div>
      </div>
    );
  };

  // Render header with key info
  const renderHeader = () => {
    if (domainObject === 'Execution') return renderExecutionHeader();
    return (
      <div className="detail-header">
        <div className="header-main">
          <div className="header-symbol">
            <span className="symbol">{data.symbol || '—'}</span>
            <span className="security-desc">{data.securityDesc || ''}</span>
          </div>
          <div className="header-badges">
            {data.side && badge('side', data.side)}
            {data.ordType && badge('ordType', data.ordType)}
            {data.state && badge('state', data.state)}
          </div>
        </div>
        <div className="header-summary">
          <div className="summary-item">
            <span className="summary-label">Quantity</span>
            <span className="summary-value">{data.orderQty != null ? formatNumber(data.orderQty) : '—'}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Price</span>
            <span className="summary-value">{data.price != null ? formatPrice(data.price) : '—'}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Account</span>
            <span className="summary-value">{data.account || '—'}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Destination</span>
            <span className="summary-value">{data.exDestination || '—'}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="detail-panel">
      {renderHeader()}
      <div className="detail-sections">
        {Object.keys(fieldGroups).map(renderSection)}
        
        {/* Render unassigned fields if any */}
        {getUnassignedFields().length > 0 && (
          <div className="detail-section expanded">
            <div className="section-header" onClick={() => toggleSection('_unassigned')}>
              <Icon name="unassigned" className="section-icon" />
              <h4>Additional Fields</h4>
              <Icon name="chevron" className={`section-toggle${expandedSections.has('_unassigned') ? ' open' : ''}`} />
            </div>
            {expandedSections.has('_unassigned') && (
              <div className="section-content">
                <div className="field-grid">
                  {getUnassignedFields().map(({ key, value }) => (
                    <div key={key} className="field-row">
                      <span className="field-label">{key}</span>
                      <span className="field-value">{formatValue(key, value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DetailPanel;
