// MetamodelMappingService.ts - Maps backend metamodel format to frontend format
import { DomainObjectType, DomainObjectMetadata, FieldMetadata } from '../types/types';

export class MetamodelMappingService {
  public static mapEntityNameToDomainObjectType(entityName: string): DomainObjectType | null {
    const mapping: { [key: string]: DomainObjectType } = {
      Order: 'Order',
      Execution: 'Execution',
      Quote: 'Quote',
      QuoteRequest: 'QuoteRequest',
    };
    return mapping[entityName] || null;
  }

  public static mapBackendMetadataToFrontend(backendMetadata: any): DomainObjectMetadata {
    return {
      name: backendMetadata.name || '',
      displayName: backendMetadata.displayName || backendMetadata.name,
      fields: (backendMetadata.fields || []).map((field: any) => this.mapFieldMetadata(field)),
      defaultColumns: backendMetadata.defaultColumns || [],
      defaultSort: backendMetadata.defaultSort,
      primaryKey: backendMetadata.primaryKey || 'id',
    };
  }

  private static mapFieldMetadata(backendField: any): FieldMetadata {
    return {
      name: backendField.name,
      displayName: backendField.displayName || backendField.name,
      type: this.mapFieldType(backendField.type),
      required: backendField.required || false,
      enumValues: backendField.enumValues,
      filterOperations: backendField.filterOperations,
      sortable: backendField.sortable !== false,
      filterable: backendField.filterable !== false,
      width: backendField.width,
      minWidth: backendField.minWidth,
      maxWidth: backendField.maxWidth,
      isComplexObject: backendField.isComplexObject,
      complexObjectType: backendField.complexObjectType,
    };
  }

  private static mapFieldType(
    backendType: string
  ): 'string' | 'number' | 'date' | 'boolean' | 'enum' | 'object' {
    const typeMap: { [key: string]: 'string' | 'number' | 'date' | 'boolean' | 'enum' | 'object' } = {
      string: 'string',
      integer: 'number',
      long: 'number',
      double: 'number',
      number: 'number',
      timestamp: 'date',
      date: 'date',
      datetime: 'date',
      boolean: 'boolean',
      enum: 'enum',
      object: 'object',
    };
    return typeMap[backendType.toLowerCase()] || 'string';
  }
}
