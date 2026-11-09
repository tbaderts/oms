import { cleanup, render, screen, within } from '@testing-library/react';
import { RunResult } from '../../src/ui/views/RunResult';
import { FIGURES } from '../../src/shared/types';
import { detail } from './fixtures';

afterEach(cleanup);

describe('RunResult view (AC-4, AC-5)', () => {
  it('renders figure table, histograms, errors and incomplete orders', () => {
    const run = detail({
      createErrors: [
        { clOrdId: 'r-1', status: 400, message: 'HTTP 400', body: 'orderQty must be positive' },
        { clOrdId: 'r-3', status: null, message: 'timeout after 5000 ms' },
      ],
      rejected: [{ clOrdId: 'r-4', orderId: 'O4', reason: 'Unknown symbol ZZZ' }],
      incomplete: [{ clOrdId: 'r-5', orderId: 'O5', lastState: 'LIVE' }],
    });
    render(<RunResult run={run} />);

    const row = (k: string) => within(screen.getByTestId(`row-${k}`)).getAllByRole('cell').map((c) => c.textContent);
    expect(row('toFilled')).toEqual(['Time to filled', '5', '45.0 ms', '2.10 s', '2.10 s', '2.10 s']);
    expect(row('toOmsAck')).toEqual(['Time to OMS ack', '3', '2.0 ms', '3.0 ms', '3.0 ms', '3.0 ms']);
    expect(row('omsToMarket')).toEqual(['OMS to market (marketSend − received)', '0', '–', '–', '–', '–']);

    for (const f of FIGURES) expect(screen.getByTestId(`histogram-${f}`)).toBeTruthy();
    expect(within(screen.getByTestId('histogram-toFilled')).getByText('n=5')).toBeTruthy();

    const errors = screen.getByTestId('create-errors');
    expect(within(errors).getByText('Create errors (2)')).toBeTruthy();
    expect(errors.textContent).toContain('r-1 · HTTP 400 · HTTP 400 — orderQty must be positive');
    expect(errors.textContent).toContain('r-3 · no response · timeout after 5000 ms');
    expect(screen.getByTestId('rejected').textContent).toContain('r-4 · O4 · Unknown symbol ZZZ');
    expect(screen.getByTestId('incomplete').textContent).toContain('r-5 · O5 · last state LIVE');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the generator-limited banner and empty lists', () => {
    render(<RunResult run={detail({ generatorLimited: true })} />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(within(screen.getByTestId('incomplete')).getByText('None.')).toBeTruthy();
  });
});
