// types.ts - Common type definitions for OMS UI

export type DomainObjectType = 'Order' | 'Execution' | 'Quote' | 'QuoteRequest';

export interface FieldMetadata {
  name: string;
  displayName: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'enum' | 'object';
  required: boolean;
  enumValues?: Array<{ value: string; label: string }>;
  filterOperations?: string[];
  sortable?: boolean;
  filterable?: boolean;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  isComplexObject?: boolean;
  complexObjectType?: string;
}

export interface DomainObjectMetadata {
  name: string;
  displayName: string;
  fields: FieldMetadata[];
  defaultColumns: string[];
  defaultSort?: string;
  primaryKey: string;
}

export interface FilterCondition {
  field: string;
  operation: string;
  value: any;
  value2?: any;
}

export interface FilterRule {
  id: string;
  field: string;
  operator: string;
  value: any;
  value2?: any;
}

export interface PageResponse<T> {
  content: T[];
  page: {
    totalElements: number;
    totalPages: number;
    size: number;
    number: number;
  };
}

export interface BlotterStateSnapshot {
  filters: { [key: string]: any };
  visibleColumns: string[];
  sortModel: any[];
  pageSize: number;
  currentPage: number;
}

export interface Order {
  id: string;
  clOrdId: string;
  symbol: string;
  side: string;
  orderQty: number;
  ordType: string;
  ordStatus: string;
  currency?: string;
  price?: number;
  sendingTime?: string;
  transactTime?: string;
  [key: string]: any;
}

export interface Execution {
  id: string;
  execId: string;
  orderId: string;
  execType: string;
  ordStatus: string;
  symbol: string;
  side: string;
  lastQty?: number;
  lastPx?: number;
  [key: string]: any;
}
