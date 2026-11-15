// ColumnConfigService.ts - Generate AG Grid column definitions from metamodel
import { ColDef } from 'ag-grid-community';
import { DomainObjectType, FieldMetadata } from '../types/types';
import { MetamodelService } from './MetamodelService';
import { dateTimeService } from './DateTimeService';
import EnumCellRenderer from '../components/EnumCellRenderer';
import IdCell from '../components/IdCell';
import { execTypeLabel, formatNumber, formatPrice, isIdField, isPriceField } from './fieldFormat';

/** Identifier columns are at least this wide, so an exec id and its order id can be told apart (SPEC-0059). */
export const ID_COLUMN_WIDTH = 220;

export class ColumnConfigService {
  private static instance: ColumnConfigService;
  private metamodelService: MetamodelService;

  private constructor() {
    this.metamodelService = MetamodelService.getInstance();
  }

  public static getInstance(): ColumnConfigService {
    if (!ColumnConfigService.instance) {
      ColumnConfigService.instance = new ColumnConfigService();
    }
    return ColumnConfigService.instance;
  }

  public getColumnConfig(domainObject: DomainObjectType, visibleColumns?: string[]): ColDef[] {
    const metadata = this.metamodelService.getMetamodel(domainObject);
    const fieldsToShow = visibleColumns || metadata.defaultColumns;

    return fieldsToShow
      .map(fieldName => {
        const field = metadata.fields.find(f => f.name === fieldName);
        if (!field) return null;
        return this.createColumnDef(field, metadata.primaryKey === fieldName);
      })
      .filter((col): col is ColDef => col !== null);
  }

  public getAllColumnConfig(domainObject: DomainObjectType): ColDef[] {
    const metadata = this.metamodelService.getMetamodel(domainObject);
    return metadata.fields.map(field => this.createColumnDef(field, metadata.primaryKey === field.name));
  }

  private createColumnDef(field: FieldMetadata, isPrimaryKey: boolean): ColDef {
    const colDef: ColDef = {
      field: field.name,
      headerName: field.displayName,
      sortable: field.sortable !== false,
      filter: this.getFilterType(field),
      resizable: true,
      width: field.width,
      minWidth: field.minWidth || 80,
      maxWidth: field.maxWidth,
    };

    // Pin primary key column
    if (isPrimaryKey) {
      colDef.pinned = 'left';
    }

    // Type-specific renderers
    if (field.type === 'date') {
      // Use DateTimeService for locale-aware formatting of ISO-8601 instant strings
      colDef.valueFormatter = (params: any) => {
        return dateTimeService.formatForDisplay(params.value);
      };
    } else if (field.type === 'number') {
      // Right-aligned so digits line up; prices with 2 to 8 decimals, other numbers as they are (SPEC-0059)
      colDef.type = 'rightAligned';
      const format = isPriceField(field.name) ? formatPrice : formatNumber;
      colDef.valueFormatter = (params: any) => format(params.value);
    } else if (field.type === 'boolean') {
      // Shown as Yes/No and filtered on that text, with Community's text filter (SPEC-0060)
      const yesNo = (value: unknown) => (value ? 'Yes' : 'No');
      colDef.valueFormatter = (params: any) => yesNo(params.value);
      colDef.filterValueGetter = (params: any) => yesNo(params.data?.[field.name]);
    } else if (field.type === 'enum' && field.enumValues) {
      const enumMap = new Map(field.enumValues.map(ev => [ev.value, ev.label]));
      colDef.valueFormatter = (params: any) => {
        return enumMap.get(params.value) || params.value;
      };
      colDef.cellRenderer = EnumCellRenderer;
    } else if (field.name === 'execType') {
      // A FIX code string, not an enum: label it here and show it as a badge like the enums (SPEC-0059)
      colDef.valueFormatter = (params: any) => (params.value == null ? '' : execTypeLabel(params.value));
      colDef.cellRenderer = EnumCellRenderer;
    }

    if (isIdField(field.name)) {
      colDef.width = Math.max(field.width ?? 0, ID_COLUMN_WIDTH);
      colDef.minWidth = Math.max(field.minWidth ?? 0, ID_COLUMN_WIDTH);
      colDef.cellRenderer = IdCell;
    }

    return colDef;
  }

  private getFilterType(field: FieldMetadata): string | boolean {
    switch (field.type) {
      case 'number':
        return 'agNumberColumnFilter';
      case 'date':
        return 'agDateColumnFilter';
      default:
        // Text, enums, ids and booleans (on their Yes/No text): the set filter is Enterprise-only.
        return 'agTextColumnFilter';
    }
  }
}
