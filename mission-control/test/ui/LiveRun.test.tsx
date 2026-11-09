import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { LiveRun } from '../../src/ui/views/LiveRun';
import { FIGURES, FIGURE_LABELS } from '../../src/shared/types';
import { series, summary } from './fixtures';

afterEach(cleanup);

describe('LiveRun view (AC-4)', () => {
  it('renders throughput, percentiles over time and state counts', () => {
    const onStop = vi.fn();
    const { container } = render(<LiveRun snapshot={{ summary: summary(), series }} onStop={onStop} />);

    expect(screen.getByTestId('progress').textContent).toContain('sent 400 / 1200');
    expect(screen.getByTestId('progress').textContent).toContain('achieved 19.98/s');

    // Throughput: the last complete second's rates.
    expect(within(screen.getByTestId('throughput')).getByText(/submitted 20\/s · completed 21\/s/)).toBeTruthy();

    // One latency chart per figure, with its percentiles.
    for (const f of FIGURES) {
      const panel = screen.getByTestId(`latency-${f}`);
      expect(within(panel).getByText(FIGURE_LABELS[f])).toBeTruthy();
    }
    expect(within(screen.getByTestId('latency-toFilled')).getByText(/p50 45.0 ms · p95 2.10 s · p99 2.10 s · n=5/)).toBeTruthy();

    // State counts.
    const states = screen.getByTestId('states');
    expect(within(states).getByText('FILLED 390')).toBeTruthy();
    expect(within(states).getByText('LIVE 5')).toBeTruthy();

    // One chart per panel (jsdom has no layout, so recharts mounts its container but draws no SVG).
    expect(container.querySelectorAll('.recharts-responsive-container').length).toBe(FIGURES.length + 2);

    fireEvent.click(screen.getByText('Stop'));
    expect(onStop).toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('warns when the generator could not keep the rate', () => {
    render(<LiveRun snapshot={{ summary: summary({ generatorLimited: true }), series }} />);
    expect(screen.getByRole('alert').textContent).toMatch(/Generator-limited/);
  });
});
