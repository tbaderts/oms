// ColumnConfigService.ts - Generate AG Grid column definitions from metamodel
import { ColDef } from 'ag-grid-community';
import { DomainObjectType, FieldMetadata } from '../types/types';
import { MetamodelService } from './MetamodelService';

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
      colDef.valueFormatter = (params: any) => {
        if (!params.value) return '';
        return new Date(params.value).toLocaleString();
      };
    } else if (field.type === 'number') {
      colDef.valueFormatter = (params: any) => {
        if (params.value == null) return '';
        return params.value.toLocaleString();
      };
    } else if (field.type === 'boolean') {
      colDef.cellRenderer = (params: any) => {
        return params.value ? '✓' : '✗';
      };
    } else if (field.type === 'enum' && field.enumValues) {
      const enumMap = new Map(field.enumValues.map(ev => [ev.value, ev.label]));
      colDef.valueFormatter = (params: any) => {
        return enumMap.get(params.value) || params.value;
      };
    }

    return colDef;
  }

  private getFilterType(field: FieldMetadata): string | boolean {
    switch (field.type) {
      case 'number':
        return 'agNumberColumnFilter';
      case 'date':
        return 'agDateColumnFilter';
      case 'boolean':
        return 'agSetColumnFilter';
      default:
        return 'agTextColumnFilter';
    }
  }
}
