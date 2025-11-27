// StaticMetamodel.ts - Fallback static metamodel when backend unavailable
import { DomainObjectType, DomainObjectMetadata } from '../types/types';

export class StaticMetamodel {
  private static metadata: Map<DomainObjectType, DomainObjectMetadata> = new Map([
    [
      'Order',
      {
        name: 'Order',
        displayName: 'Orders',
        primaryKey: 'orderId',
        defaultColumns: ['orderId', 'symbol', 'side', 'orderQty', 'ordType', 'state', 'price', 'transactTime'],
        defaultSort: 'transactTime,DESC',
        fields: [
          { name: 'orderId', displayName: 'Order ID', type: 'string', required: true, sortable: true, filterable: true, minWidth: 200 },
          { name: 'rootOrderId', displayName: 'Root Order ID', type: 'string', required: false, sortable: true, filterable: true, minWidth: 200 },
          { name: 'parentOrderId', displayName: 'Parent Order ID', type: 'string', required: false, sortable: true, filterable: true, minWidth: 200 },
          { name: 'symbol', displayName: 'Symbol', type: 'string', required: true, sortable: true, filterable: true, width: 100 },
          { name: 'side', displayName: 'Side', type: 'enum', required: true, sortable: true, filterable: true, width: 80, enumValues: [
            { value: 'BUY', label: 'Buy' }, 
            { value: 'SELL', label: 'Sell' },
            { value: 'SELL_SHORT', label: 'Sell Short' },
            { value: 'SUBSCRIBE', label: 'Subscribe' },
            { value: 'REDEEM', label: 'Redeem' }
          ] },
          { name: 'orderQty', displayName: 'Quantity', type: 'number', required: true, sortable: true, filterable: true, width: 120 },
          { name: 'ordType', displayName: 'Order Type', type: 'enum', required: true, sortable: true, filterable: true, width: 120, enumValues: [
            { value: 'MARKET', label: 'Market' },
            { value: 'LIMIT', label: 'Limit' },
            { value: 'STOP', label: 'Stop' },
            { value: 'STOP_LIMIT', label: 'Stop Limit' },
            { value: 'MARKET_ON_CLOSE', label: 'Market On Close' }
          ] },
          { name: 'state', displayName: 'State', type: 'enum', required: true, sortable: true, filterable: true, width: 100, enumValues: [
            { value: 'NEW', label: 'New' },
            { value: 'UNACK', label: 'Unacknowledged' },
            { value: 'LIVE', label: 'Live' },
            { value: 'FILLED', label: 'Filled' },
            { value: 'CXL', label: 'Cancelled' },
            { value: 'REJ', label: 'Rejected' },
            { value: 'CLOSED', label: 'Closed' },
            { value: 'EXP', label: 'Expired' }
          ] },
          { name: 'price', displayName: 'Price', type: 'number', required: false, sortable: true, filterable: true, width: 120 },
          { name: 'transactTime', displayName: 'Transaction Time', type: 'date', required: false, sortable: true, filterable: true, minWidth: 180 },
        ],
      },
    ],
    [
      'Execution',
      {
        name: 'Execution',
        displayName: 'Executions',
        primaryKey: 'id',
        defaultColumns: ['id', 'execId', 'orderId', 'execType', 'ordStatus', 'symbol', 'side', 'lastQty', 'lastPx'],
        defaultSort: 'transactTime,DESC',
        fields: [
          { name: 'id', displayName: 'ID', type: 'string', required: true, sortable: true, filterable: true, width: 80 },
          { name: 'execId', displayName: 'Execution ID', type: 'string', required: true, sortable: true, filterable: true, minWidth: 150 },
          { name: 'orderId', displayName: 'Order ID', type: 'string', required: true, sortable: true, filterable: true, minWidth: 150 },
          { name: 'execType', displayName: 'Execution Type', type: 'string', required: true, sortable: true, filterable: true, width: 120 },
          { name: 'ordStatus', displayName: 'Order Status', type: 'string', required: true, sortable: true, filterable: true, width: 120 },
          { name: 'symbol', displayName: 'Symbol', type: 'string', required: true, sortable: true, filterable: true, width: 100 },
          { name: 'side', displayName: 'Side', type: 'enum', required: true, sortable: true, filterable: true, width: 80, enumValues: [{ value: 'BUY', label: 'Buy' }, { value: 'SELL', label: 'Sell' }] },
          { name: 'lastQty', displayName: 'Last Quantity', type: 'number', required: false, sortable: true, filterable: true, width: 120 },
          { name: 'lastPx', displayName: 'Last Price', type: 'number', required: false, sortable: true, filterable: true, width: 100 },
          { name: 'transactTime', displayName: 'Transaction Time', type: 'date', required: false, sortable: true, filterable: true, minWidth: 180 },
        ],
      },
    ],
  ]);

  public static getMetadata(domainObject: DomainObjectType): DomainObjectMetadata | null {
    return this.metadata.get(domainObject) || null;
  }
}
