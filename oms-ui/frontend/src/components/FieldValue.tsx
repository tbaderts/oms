// FieldValue.tsx - One field's value, formatted as the detail panel shows it (SPEC-0058, SPEC-0059).
// Shared by the detail panel and the order History view's changes list (SPEC-0074), so both
// follow one set of rules.
import React from 'react';
import { dateTimeService } from '../services/DateTimeService';
import EnumCellRenderer from './EnumCellRenderer';
import { execTypeLabel, formatNumber, formatPrice, isPriceField } from '../services/fieldFormat';
import { MetamodelService } from '../services/MetamodelService';
import { DomainObjectType } from '../types/types';

/** Fields shown as badges, like their grid cells (SPEC-0058). */
export const BADGE_FIELDS = new Set(['side', 'ordType', 'state', 'cancelState', 'timeInForce']);

/** The metamodel's label for an enum value ("Sell Short"), or the value itself without one. */
export function enumLabel(domainObject: DomainObjectType | undefined, field: string, value: string): string {
  if (!domainObject) return value;
  try {
    const metadata = MetamodelService.getInstance().getMetamodel(domainObject);
    return metadata.fields.find(f => f.name === field)?.enumValues?.find(e => e.value === value)?.label ?? value;
  } catch {
    // The metamodel is not loaded (it always is behind a blotter): show the value.
    return value;
  }
}

/** A badge exactly as the grid draws it: the label, in the value's tone. */
export function enumBadge(domainObject: DomainObjectType | undefined, field: string, value: string): React.JSX.Element {
  return <EnumCellRenderer value={value} valueFormatted={enumLabel(domainObject, field, value)} />;
}

/** The value of field `key`, formatted for display. */
export function formatFieldValue(key: string, value: any, domainObject?: DomainObjectType): React.JSX.Element | string {
  if (value === null || value === undefined) {
    return <span className="value-null">—</span>;
  }

  // Enum fields as badges, like their grid cells
  if (BADGE_FIELDS.has(key) && typeof value === 'string') {
    return enumBadge(domainObject, key, value);
  }

  // The FIX exec type code, named as in the grid (SPEC-0059)
  if (key === 'execType' && typeof value === 'string') {
    return <EnumCellRenderer value={value} valueFormatted={execTypeLabel(value)} />;
  }

  // Numbers as in the grid: prices with 2 to 8 decimals, others with separators (SPEC-0059)
  if (typeof value === 'number') {
    if (key === 'id' || key === 'txNr' || key === 'orderVersion') {
      return <span className="value-number">{value}</span>;
    }
    const formatted = isPriceField(key) ? formatPrice(value) : formatNumber(value);
    return <span className="value-number">{formatted}</span>;
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
}
