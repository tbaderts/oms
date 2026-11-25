import { ColumnConfigService } from './ColumnConfigService';
import IdCell from '../components/IdCell';
import EnumCellRenderer from '../components/EnumCellRenderer';

const mockField = (name: string, type: string, extra: object = {}) => ({ name, displayName: name, type, required: false, width: 150, ...extra });
const mockFields = [
  mockField('execId', 'string'),
  mockField('orderId', 'string'),
  mockField('symbol', 'string'),
  mockField('execType', 'string'),
  mockField('side', 'enum', { enumValues: [{ value: 'BUY', label: 'Buy' }] }),
  mockField('lastPx', 'number', { width: 100 }),
  mockField('avgPx', 'number', { width: 100 }),
  mockField('lastQty', 'number', { width: 100 }),
  mockField('transactTime', 'date'),
  mockField('manual', 'boolean'),
];

jest.mock('./MetamodelService', () => ({
  MetamodelService: {
    getInstance: () => ({
      getMetamodel: () => ({ name: 'Execution', displayName: 'Executions', fields: mockFields, defaultColumns: mockFields.map(f => f.name), primaryKey: 'id' }),
    }),
  },
}));

const columns = () => ColumnConfigService.getInstance().getAllColumnConfig('Execution');
const col = (name: string) => columns().find(c => c.field === name)!;
const format = (name: string, value: unknown) => (col(name).valueFormatter as any)({ value });

describe('ColumnConfigService (SPEC-0059)', () => {
  test('right-aligns number columns only', () => {
    for (const name of ['lastPx', 'avgPx', 'lastQty']) expect(col(name).type).toBe('rightAligned');
    for (const name of ['execId', 'symbol', 'side', 'transactTime', 'execType']) expect(col(name).type).toBeUndefined();
  });

  test('uses the price and quantity formatters', () => {
    expect(format('lastPx', 170)).toBe('170.00');
    expect(format('avgPx', 86.96)).toBe('86.96');
    expect(format('lastQty', 1000)).toBe('1,000');
    expect(format('lastQty', null)).toBe('');
  });

  test('labels execType and shows it as a badge', () => {
    expect(format('execType', 'F')).toBe('Trade');
    expect(format('execType', 'Z')).toBe('Z');
    expect(col('execType').cellRenderer).toBe(EnumCellRenderer);
  });

  test('id columns are at least 220 px and use IdCell', () => {
    for (const name of ['execId', 'orderId']) {
      expect(col(name).width).toBeGreaterThanOrEqual(220);
      expect(col(name).minWidth).toBeGreaterThanOrEqual(220);
      expect(col(name).cellRenderer).toBe(IdCell);
    }
    expect(col('symbol').cellRenderer).toBeUndefined();
  });
});

describe('ColumnConfigService (SPEC-0060)', () => {
  // AC-6: agSetColumnFilter is AG Grid Enterprise; Community filters a boolean as the text it shows.
  test('boolean columns use a Community text filter on Yes/No', () => {
    const manual = col('manual');
    expect(manual.filter).toBe('agTextColumnFilter');
    expect(format('manual', true)).toBe('Yes');
    expect(format('manual', false)).toBe('No');
    expect((manual.filterValueGetter as any)({ data: { manual: true } })).toBe('Yes');
    expect((manual.filterValueGetter as any)({ data: { manual: false } })).toBe('No');
  });

  test('no column asks for an Enterprise filter', () => {
    for (const c of columns()) expect(['agTextColumnFilter', 'agNumberColumnFilter', 'agDateColumnFilter']).toContain(c.filter);
  });
});

describe('ColumnConfigService (SPEC-0068)', () => {
  // AC-5: a saved layout may name a field the metamodel no longer offers (dayAvgPx was offered
  // before SPEC-0068); that column is skipped and the others still show.
  test('skips a saved column that is no longer offered', () => {
    let saved: ReturnType<ColumnConfigService['getColumnConfig']> = [];
    expect(() => {
      saved = ColumnConfigService.getInstance().getColumnConfig('Execution', ['dayAvgPx', 'lastQty']);
    }).not.toThrow();
    expect(saved.map(c => c.field)).toEqual(['lastQty']);
  });
});
