import React from 'react';
import { render, screen, within } from '@testing-library/react';
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
