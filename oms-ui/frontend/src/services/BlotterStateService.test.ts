// BlotterStateService.test.ts - Tests for localStorage-backed blotter state
import { BlotterStateService } from './BlotterStateService';
import { BlotterStateSnapshot } from '../types/types';

describe('BlotterStateService', () => {
  let service: BlotterStateService;

  const orderState: BlotterStateSnapshot = {
    filters: { symbol__like: '%BTC%' },
    visibleColumns: ['orderId', 'symbol', 'side'],
    sortModel: [{ colId: 'transactTime', sort: 'desc' }],
    pageSize: 100,
    currentPage: 1,
  };

  beforeEach(() => {
    localStorage.clear();
    (BlotterStateService as any).instance = null;
    service = BlotterStateService.getInstance();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('returns null when no state was saved', () => {
    expect(service.getState('Order')).toBeNull();
  });

  it('saves and retrieves state for a domain object', () => {
    service.saveState('Order', orderState);

    expect(service.getState('Order')).toEqual(orderState);
  });

  it('persists state to localStorage', () => {
    service.saveState('Order', orderState);

    const raw = localStorage.getItem('oms.blotter.state.Order');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual(orderState);
  });

  it('hydrates state from localStorage on a fresh instance', () => {
    service.saveState('Order', orderState);
    (BlotterStateService as any).instance = null;

    const fresh = BlotterStateService.getInstance();

    expect(fresh.getState('Order')).toEqual(orderState);
  });

  it('keeps state for different domain objects separate', () => {
    const executionState: BlotterStateSnapshot = {
      ...orderState,
      visibleColumns: ['execId', 'orderId'],
    };
    service.saveState('Order', orderState);
    service.saveState('Execution', executionState);

    expect(service.getState('Order')).toEqual(orderState);
    expect(service.getState('Execution')).toEqual(executionState);
  });

  it('clears state for a single domain object', () => {
    service.saveState('Order', orderState);
    service.clearState('Order');

    expect(service.getState('Order')).toBeNull();
    expect(localStorage.getItem('oms.blotter.state.Order')).toBeNull();
  });

  it('clears all states and storage entries', () => {
    service.saveState('Order', orderState);
    service.saveState('Execution', orderState);

    service.clearAllStates();

    expect(service.getState('Order')).toBeNull();
    expect(service.getState('Execution')).toBeNull();
    expect(localStorage.getItem('oms.blotter.state.Order')).toBeNull();
    expect(localStorage.getItem('oms.blotter.state.Execution')).toBeNull();
  });

  it('notifies listeners when state is saved', () => {
    const listener = jest.fn();
    service.addStateChangeListener('Order', listener);

    service.saveState('Order', orderState);
    expect(listener).toHaveBeenCalledWith(orderState);

    service.removeStateChangeListener('Order', listener);
    service.saveState('Order', { ...orderState, currentPage: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
