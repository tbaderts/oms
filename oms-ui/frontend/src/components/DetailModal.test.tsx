import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import DetailModal from './DetailModal';

// SPEC-0058 AC-5: the modal is titled by the object it shows, in the singular ("Order details").
describe('DetailModal (SPEC-0058)', () => {
  it('titles the modal by the singular object', () => {
    render(<DetailModal data={{ orderId: 'ORD-1' }} title="Order details" onClose={() => undefined} />);

    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Order details');
    expect(screen.queryByText(/Orders Details/)).toBeNull();
  });

  it('closes from the header icon button, which has a name', () => {
    const onClose = jest.fn();
    const { container } = render(<DetailModal data={{ orderId: 'ORD-1' }} title="Order details" onClose={onClose} />);

    const close = container.querySelector('.modal-header button') as HTMLElement;
    expect(close.getAttribute('aria-label')).toBe('Close details');
    expect(close.querySelector('svg')).not.toBeNull();
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalled();
  });
});

// SPEC-0059 AC-6: Escape closes the modal; other keys do not.
describe('DetailModal keyboard (SPEC-0059)', () => {
  it('Escape closes', () => {
    const onClose = jest.fn();
    render(<DetailModal data={{ orderId: 'ORD-1' }} title="Order details" onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: 'Order details' }).getAttribute('aria-modal')).toBe('true');
    fireEvent.keyDown(document, { key: 'a' });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// SPEC-0074 AC-8, AC-9: an order's details offer a History view, fetched only when selected.
const mockGetOrderEvents = jest.fn();
const mockGetOrderCommands = jest.fn();

jest.mock('../services/OMSApiService', () => ({
  OMSApiService: {
    getInstance: async () => ({
      getOrderEvents: (...args: any[]) => mockGetOrderEvents(...args),
      getOrderCommands: (...args: any[]) => mockGetOrderCommands(...args),
    }),
  },
}));

describe('DetailModal history (SPEC-0074)', () => {
  beforeEach(() => {
    mockGetOrderEvents.mockReset().mockResolvedValue([
      { orderId: 'ORD-1', version: 1, event: 'NEW_ORDER', resultingState: 'UNACK', timeStamp: '2026-11-25T09:00:00Z' },
    ]);
    mockGetOrderCommands.mockReset().mockResolvedValue([]);
  });

  it('fetches history only when the History tab is selected', async () => {
    render(<DetailModal data={{ orderId: 'ORD-1', symbol: 'AAPL' }} title="Order details" domainObject="Order" onClose={() => undefined} />);

    const details = screen.getByRole('tab', { name: 'Details' });
    const history = screen.getByRole('tab', { name: 'History' });
    expect(details.getAttribute('aria-selected')).toBe('true');
    expect(history.getAttribute('aria-selected')).toBe('false');
    expect(screen.getAllByText('AAPL')[0]).toBeVisible();
    await act(async () => undefined);
    expect(mockGetOrderEvents).not.toHaveBeenCalled();
    expect(mockGetOrderCommands).not.toHaveBeenCalled();

    fireEvent.click(history);

    expect(history.getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByText('NEW_ORDER')).toBeInTheDocument();
    expect(mockGetOrderEvents).toHaveBeenCalledWith('ORD-1');
    expect(mockGetOrderCommands).toHaveBeenCalledWith('ORD-1');

    // back to Details and again to History: the loaded history is kept, not fetched again
    fireEvent.click(details);
    expect(screen.getAllByText('AAPL')[0]).toBeVisible();
    fireEvent.click(history);
    expect(await screen.findByText('NEW_ORDER')).toBeInTheDocument();
    expect(mockGetOrderEvents).toHaveBeenCalledTimes(1);
  });

  it('keeps the Details tab working when the history fails to load (AC-6)', async () => {
    mockGetOrderEvents.mockRejectedValue(new Error('Request failed with status code 503'));
    render(<DetailModal data={{ orderId: 'ORD-1', symbol: 'AAPL' }} title="Order details" domainObject="Order" onClose={() => undefined} />);

    fireEvent.click(screen.getByRole('tab', { name: 'History' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/503/);

    fireEvent.click(screen.getByRole('tab', { name: 'Details' }));
    expect(screen.getByRole('tab', { name: 'Details' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getAllByText('AAPL')[0]).toBeVisible();
    expect(screen.getByRole('alert', { hidden: true })).not.toBeVisible();
  });

  it('offers no History tab for an execution', async () => {
    render(<DetailModal data={{ execId: 'EX-1', orderId: 'ORD-1' }} title="Execution details" domainObject="Execution" onClose={() => undefined} />);

    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('tab', { name: 'History' })).toBeNull();
    await act(async () => undefined);
    expect(mockGetOrderEvents).not.toHaveBeenCalled();
  });
});
