import { isStreamed, mergeLiveSelection, splitColumns } from './streamedFields';

// The backend metamodel's default columns (oms-core MetamodelService). Every one of them must be
// streamed, so live and History mode show the same default columns (SPEC-0056 AC-5).
const DEFAULT_COLUMNS = {
  Order: ['orderId', 'clOrdId', 'side', 'orderQty', 'ordType', 'price', 'symbol', 'state', 'timeInForce', 'securityId', 'transactTime'],
  Execution: ['execId', 'orderId', 'execType', 'lastQty', 'lastPx', 'cumQty', 'leavesQty', 'avgPx', 'transactTime'],
} as const;

describe('streamed fields (SPEC-0056)', () => {
  it('streams every default column of orders and executions', () => {
    (Object.keys(DEFAULT_COLUMNS) as Array<keyof typeof DEFAULT_COLUMNS>).forEach(domain => {
      DEFAULT_COLUMNS[domain].forEach(column => expect([domain, column, isStreamed(domain, column)]).toEqual([domain, column, true]));
    });
  });

  it('does not claim fields the stream lacks', () => {
    expect(isStreamed('Execution', 'id')).toBe(false);
    expect(isStreamed('Execution', 'creationDate')).toBe(false);
    // Streamed since SPEC-0071: from the execution search and the fill's ExecType.
    expect(isStreamed('Execution', 'status')).toBe(true);
    expect(isStreamed('Order', 'txNr')).toBe(false);
  });

  it('splits saved columns into live and history-only, keeping their order', () => {
    expect(splitColumns('Execution', ['execId', 'id', 'orderId', 'creationDate'])).toEqual({
      live: ['execId', 'orderId'],
      historyOnly: ['id', 'creationDate'],
    });
  });

  it('keeps history-only columns in place when a live selection is applied', () => {
    expect(mergeLiveSelection('Execution', ['execId', 'id', 'orderId', 'creationDate'], ['execId', 'lastQty']))
      .toEqual(['execId', 'id', 'lastQty', 'creationDate']);
  });
});
