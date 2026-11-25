import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import DetailPanel from './DetailPanel';

describe('DetailPanel', () => {
  // The venue's reason is read next to the state it explains, apart from the client's own text.
  it('showsRejectReasonInStatusSection', () => {
    render(
      <DetailPanel
        data={{
          orderId: 'ORD-1',
          symbol: 'ZZZZ',
          state: 'REJ',
          rejectReason: 'Unknown symbol ZZZZ',
          text: 'Sample order',
        }}
      />
    );

    const statusSection = screen.getByRole('heading', { name: 'Status' }).closest('.detail-section') as HTMLElement;
    expect(within(statusSection).getByText('Reject Reason')).toBeInTheDocument();
    expect(within(statusSection).getByText('Unknown symbol ZZZZ')).toBeInTheDocument();
  });
});

// SPEC-0058 AC-5: section headers show an icon and their title; no text stands in for an icon.
describe('DetailPanel section headers (SPEC-0058)', () => {
  it('section headers show an icon, not an abbreviation', () => {
    const { container } = render(
      <DetailPanel
        data={{ orderId: 'ORD-1', symbol: 'MSFT', side: 'BUY', state: 'LIVE', transactTime: '2026-11-10T08:00:00Z', unmappedField: 'x' }}
      />
    );

    const headers = Array.from(container.querySelectorAll('.section-header'));
    expect(headers.length).toBeGreaterThan(3);
    headers.forEach(header => {
      expect(header.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
      const title = header.querySelector('h4')?.textContent ?? '';
      // Nothing but the title is text: no abbreviation, no ▼ / ▶ glyph.
      expect(header.textContent).toBe(title);
    });
    const abbreviations = ['ID', 'INST', 'ORD', 'EXEC', 'ST', 'TIME', 'SETL', 'DER', 'MISC', 'UNASSIGNED'];
    abbreviations.forEach(text => expect(screen.queryByText(text, { exact: true })).toBeNull());
  });
});

// SPEC-0058 (review): the detail modal's badges read like the grid's: the metamodel label, in the
// same tone, not the raw code ("SELL_SHORT").
jest.mock('../services/MetamodelService', () => ({
  MetamodelService: {
    getInstance: () => ({
      getMetamodel: () => ({
        fields: [
          { name: 'side', enumValues: [{ value: 'SELL_SHORT', label: 'Sell Short' }] },
          { name: 'ordType', enumValues: [{ value: 'MARKET_ON_CLOSE', label: 'Market On Close' }] },
          { name: 'state', enumValues: [{ value: 'LIVE', label: 'Live' }] },
        ],
      }),
    }),
  },
}));

describe('DetailPanel badges (SPEC-0058)', () => {
  it('shows the metamodel labels as the grid badges do', () => {
    const { container } = render(
      <DetailPanel domainObject="Order" data={{ orderId: 'ORD-1', symbol: 'MSFT', side: 'SELL_SHORT', ordType: 'MARKET_ON_CLOSE', state: 'LIVE' }} />
    );

    const header = Array.from(container.querySelectorAll('.header-badges .enum-cell')).map(b => [b.textContent, b.className]);
    expect(header).toEqual([
      ['Sell Short', 'enum-cell enum-sell-short'],
      ['Market On Close', 'enum-cell enum-market-on-close'],
      ['Live', 'enum-cell enum-live'],
    ]);
    expect(container.textContent).not.toMatch(/SELL_SHORT|MARKET_ON_CLOSE/);
  });

  it('falls back to the value without a metamodel label', () => {
    const { container } = render(<DetailPanel data={{ orderId: 'ORD-1', state: 'CXL' }} />);

    expect(container.querySelector('.header-badges .enum-cell')?.textContent).toBe('CXL');
  });
});

// SPEC-0059: the detail panel formats like the grid and names the FIX exec type.
describe('DetailPanel formatting (SPEC-0059)', () => {
  it('shows the exec type label and formatted prices and quantities', () => {
    render(<DetailPanel data={{ orderId: 'ORD-1', execId: 'ORD-1-F1', execType: 'F', lastPx: 170, avgPx: 86.96, lastQty: 1000, price: 1234.5, orderQty: 2500 }} />);
    fireEvent.click(screen.getByRole('heading', { name: 'Execution' }));
    const execution = screen.getByRole('heading', { name: 'Execution' }).closest('.detail-section') as HTMLElement;
    expect(within(execution).getByText('Trade')).toBeInTheDocument();
    expect(within(execution).getByText('170.00')).toBeInTheDocument();
    expect(within(execution).getByText('86.96')).toBeInTheDocument();
    expect(within(execution).getByText('1,000')).toBeInTheDocument();
    const order = screen.getByRole('heading', { name: 'Order Details' }).closest('.detail-section') as HTMLElement;
    expect(within(order).getByText('1,234.50')).toBeInTheDocument();
    expect(within(order).getByText('2,500')).toBeInTheDocument();
  });
});

// An execution's details show the fill, not the order: no order-only field reads as an empty value.
describe('DetailPanel execution layout', () => {
  const fill = {
    orderId: 'ORD-1', execId: 'ORD-1-F1', execType: 'F', lastQty: 500, lastPx: 86.96, avgPx: 86.96,
    cumQty: 500, leavesQty: 0, lastMkt: 'XNAS', transactTime: '2026-11-24T09:30:00Z', orderVersion: 3,
  };

  it('heads the panel with the fill and the order progress it leaves', () => {
    const { container } = render(<DetailPanel domainObject="Execution" data={fill} />);

    expect(container.querySelector('.header-symbol .symbol')?.textContent).toBe('500 @ 86.96');
    expect(container.querySelector('.header-symbol .security-desc')?.textContent).toBe('on XNAS');
    expect(container.querySelector('.header-badges')?.textContent).toBe('Trade');
    const labels = Array.from(container.querySelectorAll('.summary-label')).map(l => l.textContent);
    expect(labels).toEqual(['Cumulative Qty', 'Leaves Qty', 'Avg Px', 'Transact Time']);
    expect(container.querySelector('.header-summary')?.textContent).not.toMatch(/—/);
    ['Quantity', 'Price', 'Account', 'Destination'].forEach(label =>
      expect(screen.queryByText(label, { exact: true })).toBeNull());
  });

  it('leaves out the order fields an execution row may carry', () => {
    const { container } = render(
      <DetailPanel domainObject="Execution" data={{ ...fill, symbol: 'MSFT', side: 'BUY', price: 87, orderQty: 1000, account: 'A1', exDestination: 'XNAS', state: 'FILLED' }} />
    );

    const sections = Array.from(container.querySelectorAll('.section-header h4')).map(h => h.textContent);
    // The symbol is the fill's own (SPEC-0069); side, price, account and state are the order's.
    expect(sections).toEqual(['Execution', 'Instrument', 'Order Progress', 'Identification', 'Timing']);
    expect(container.textContent).not.toMatch(/Additional Fields|Order Details|A1|FILLED/);
  });

  // SPEC-0069 AC-7: the instrument the venue reported on the fill
  it('shows the instrument in an Instrument section', () => {
    render(<DetailPanel domainObject="Execution" data={{ ...fill, symbol: 'MSFT', securityId: 'US5949181045', securityIdSource: 'ISIN' }} />);

    const instrument = screen.getByRole('heading', { name: 'Instrument' }).closest('.detail-section') as HTMLElement;
    expect(within(instrument).getByText('MSFT')).toBeInTheDocument();
    expect(within(instrument).getByText('US5949181045')).toBeInTheDocument();
    expect(within(instrument).getByText('ISIN')).toBeInTheDocument();
  });

  it('keeps fields it does not know under Additional Fields', () => {
    render(<DetailPanel domainObject="Execution" data={{ ...fill, somethingNew: 'x' }} />);

    expect(screen.getByRole('heading', { name: 'Additional Fields' })).toBeInTheDocument();
  });
});
