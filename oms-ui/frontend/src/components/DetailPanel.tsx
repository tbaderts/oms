// DetailPanel.tsx - Well-organized detail panel for viewing order data
import React, { useState } from 'react';
import { dateTimeService } from '../services/DateTimeService';
import Icon, { IconName } from './icons/Icon';
import EnumCellRenderer from './EnumCellRenderer';
import { MetamodelService } from '../services/MetamodelService';
import { DomainObjectType } from '../types/types';
import './DetailPanel.scss';

interface DetailPanelProps {
  data: any;
  /** Whose metamodel labels the badges show (SPEC-0058); without it a badge shows the raw value. */
  domainObject?: DomainObjectType;
  columns?: string[];
}

// Field groupings for organized display
const fieldGroups: Record<string, { title: string; fields: string[]; icon: IconName }> = {
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
    fields: ['cumQty', 'leavesQty', 'placeQty', 'allocQty', 'exDestination', 'handlInst', 'execInst'],
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
  id: 'Internal ID',
  tx: 'Transaction',
  txNr: 'Transaction Number',
  text: 'Text',
};

// Fields shown as badges, like their grid cells (SPEC-0058)
const BADGE_FIELDS = new Set(['side', 'ordType', 'state', 'cancelState', 'timeInForce']);

/** The metamodel's label for an enum value ("Sell Short"), or the value itself without one. */
function enumLabel(domainObject: DomainObjectType | undefined, field: string, value: string): string {
  if (!domainObject) return value;
  try {
    const metadata = MetamodelService.getInstance().getMetamodel(domainObject);
    return metadata.fields.find(f => f.name === field)?.enumValues?.find(e => e.value === value)?.label ?? value;
  } catch {
    // The metamodel is not loaded (it always is behind a blotter): show the value.
    return value;
  }
}

const DetailPanel: React.FC<DetailPanelProps> = ({ data, domainObject }) => {
  /** A badge exactly as the grid draws it: the label, in the value's tone. */
  const badge = (field: string, value: string) => (
    <EnumCellRenderer value={value} valueFormatted={enumLabel(domainObject, field, value)} />
  );

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['identification', 'instrument', 'orderDetails', 'status'])
  );

  if (!data) {
    return (
      <div className="detail-panel">
        <p className="no-data">No order selected</p>
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

  const formatValue = (key: string, value: any): React.JSX.Element | string => {
    if (value === null || value === undefined) {
      return <span className="value-null">—</span>;
    }

    // Enum fields as badges, like their grid cells
    if (BADGE_FIELDS.has(key) && typeof value === 'string') {
      return badge(key, value);
    }

    // Format numbers with proper formatting
    if (typeof value === 'number') {
      if (key.toLowerCase().includes('qty') || key.toLowerCase().includes('quantity')) {
        return <span className="value-number">{value.toLocaleString()}</span>;
      }
      if (key.toLowerCase().includes('price') || key === 'price' || key === 'stopPx') {
        return <span className="value-number">{value.toFixed(2)}</span>;
      }
      return <span className="value-number">{value}</span>;
    }

    // Format dates/times - use DateTimeService for locale-aware formatting of ISO-8601 instants
    if (key.toLowerCase().includes('time') || key.toLowerCase().includes('timestamp')) {
      const formattedDate = dateTimeService.formatForDisplay(value);
      if (formattedDate) {
        return (
          <span className="value-date">
            {formattedDate}
          </span>
        );
      }
    }

    // Format boolean
    if (typeof value === 'boolean') {
      return <span className={`value-boolean ${value ? 'true' : 'false'}`}>{value ? 'Yes' : 'No'}</span>;
    }

    // Format objects
    if (typeof value === 'object') {
      return <pre className="value-object">{JSON.stringify(value, null, 2)}</pre>;
    }

    return <span className="value-string">{String(value)}</span>;
  };

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
      .filter(key => !assignedFields.has(key))
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

  // Render header with key info
  const renderHeader = () => {
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
            <span className="summary-value">{data.orderQty?.toLocaleString() || '—'}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Price</span>
            <span className="summary-value">{data.price?.toFixed(2) || '—'}</span>
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
