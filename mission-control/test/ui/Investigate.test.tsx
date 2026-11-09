import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Investigate } from '../../src/ui/views/Investigate';
import { RunResult } from '../../src/ui/views/RunResult';
import type { Investigate as InvestigateFn } from '../../src/ui/api';
import { detail } from './fixtures';

afterEach(cleanup);

describe('Investigate view (AC-8)', () => {
  it('shows not-configured and leaves the rest usable', () => {
    const run = vi.fn();
    render(
      <>
        <RunResult run={detail()} />
        <Investigate runId="r1" status={{ available: false, provider: 'anthropic', reason: 'Set ANTHROPIC_API_KEY to enable AI investigation' }} investigate={run} />
      </>,
    );
    expect(screen.getByText(/Set ANTHROPIC_API_KEY/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Ask' }) as HTMLButtonElement).disabled).toBe(true);
    expect(run).not.toHaveBeenCalled();
    // The run result still renders next to it.
    expect(screen.getByTestId('figure-table')).toBeTruthy();
  });

  it('streams tool calls and the answer', async () => {
    const investigate: InvestigateFn = async (_runId, _prompt, onStart, onEvent) => {
      onStart('inv1');
      onEvent({ type: 'ai:tool-call', invId: 'inv1', toolCallId: 'c1', name: 'slowestOrders', input: { figure: 'toFilled', limit: 5 } });
      onEvent({ type: 'ai:tool-result', invId: 'inv1', toolCallId: 'c1', name: 'slowestOrders', output: '[{"seq":17}]' });
      onEvent({ type: 'ai:message', invId: 'inv1', text: 'Order 17 waited ' });
      onEvent({ type: 'ai:message', invId: 'inv1', text: 'in the outbox.' });
      onEvent({ type: 'ai:done', invId: 'inv1', aborted: false, incomplete: false });
    };
    const spy = vi.fn(investigate);
    render(<Investigate runId="r1" status={{ available: true, provider: 'anthropic', model: 'm' }} investigate={spy} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Why is time to filled p99 high?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    await waitFor(() => expect(screen.getByTestId('answer').textContent).toBe('Order 17 waited in the outbox.'));
    expect(spy.mock.calls[0][0]).toBe('r1');
    expect(spy.mock.calls[0][1]).toBe('Why is time to filled p99 high?');
    expect(screen.getByTestId('tool-c1').textContent).toContain('slowestOrders');
    expect(screen.getByTestId('tool-c1').textContent).toContain('"figure":"toFilled"');
    expect(screen.getByTestId('tool-c1').textContent).toContain('[{"seq":17}]');
  });

  it('shows a provider error', async () => {
    const investigate: InvestigateFn = async (_r, _p, onStart, onEvent) => {
      onStart('inv2');
      onEvent({ type: 'ai:error', invId: 'inv2', kind: 'provider', message: '401 invalid x-api-key' });
    };
    render(<Investigate runId="r1" status={{ available: true, provider: 'anthropic' }} investigate={investigate} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'q' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('401 invalid x-api-key'));
  });
});
